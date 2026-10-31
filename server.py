"""Robot Arm Studio: local USB bridge, authenticated LAN UI and SQLite storage."""
import argparse, asyncio, contextlib, io, json, os, re, secrets, socket, sqlite3, time, webbrowser, logging
from pathlib import Path
from aiohttp import web, WSMsgType
from phone_access import PhoneSharing
ROOT=Path(__file__).resolve().parent
LIMITS=[(500,2500)]*5+[(810,1710)]
OPS=set('HELLO PING HOLD90 LIMITS STOP STOPMOVE BRAKE ARMALL ARM INIT JOG JOG2 MOVE GRIP GRIPFAST OPENFAST RELEASE_GRIP SEQBEGIN SEQADD SEQRUN'.split())

def clean_routine(r):
    if not isinstance(r,dict) or r.get('version') not in (2,3,4,5,6): raise ValueError('Invalid routine version')
    name=r.get('name'); poses=r.get('poses')
    if not isinstance(name,str) or not name.strip() or len(name)>60 or not isinstance(poses,list) or not 1<=len(poses)<=100: raise ValueError('Invalid routine')
    for p in poses:
        if not isinstance(p,dict) or not isinstance(p.get('name'),str) or len(p['name'])>60: raise ValueError('Invalid pose')
        vals=p.get('p');count={2:2,3:3}.get(r['version'],6)
        if not isinstance(vals,list) or len(vals)!=count: raise ValueError('Invalid axes')
        if any(v is not None and (type(v)!=int or not LIMITS[i][0]<=v<=LIMITS[i][1]) for i,v in enumerate(vals)): raise ValueError('Invalid position')
        for k,low in [('moveMs',200),('holdMs',0)]:
            if type(p.get(k))!=int or not low<=p[k]<=30000: raise ValueError('Invalid duration')
        if 'grip' in p:
            g=p['grip']
            if not isinstance(g,dict) or g.get('action') not in ('position','keep','grab','open','release') or type(g.get('target'))!=int or not 810<=g['target']<=1710 or type(g.get('settleMs'))!=int or not 0<=g['settleMs']<=2000:raise ValueError('Invalid grip action')
    return r

class Studio:
    def __init__(self,db,token=None,simulated=False):
        self.media_dir=Path(db).parent/'project-media';self.media_dir.mkdir(parents=True,exist_ok=True)
        self.token=token or secrets.token_urlsafe(32);self.control_token=secrets.token_urlsafe(32);self.pin=str(secrets.randbelow(900000)+100000)
        self.db=sqlite3.connect(str(db));self.db.execute('PRAGMA journal_mode=WAL')
        self.db.execute('CREATE TABLE IF NOT EXISTS routines(name TEXT PRIMARY KEY, data TEXT NOT NULL, updated REAL NOT NULL)')
        self.db.execute('CREATE TABLE IF NOT EXISTS kv(key TEXT PRIMARY KEY, data TEXT NOT NULL)');self.db.execute('CREATE TABLE IF NOT EXISTS media(id TEXT PRIMARY KEY,name TEXT NOT NULL,type TEXT NOT NULL,created REAL NOT NULL)');self.db.commit()
        self.serial=None;self.controller=None;self.controller_scope=None;self.last_client=0;self.lock=asyncio.Lock();self.tasks=[];self.pair_attempts={};self.simulated=simulated
    @staticmethod
    def request_token(r):
        return r.headers.get('Authorization','').removeprefix('Bearer ') or r.query.get('token','')
    def auth(self,r):
        token=self.request_token(r)
        return bool(token) and (secrets.compare_digest(token,self.token) or secrets.compare_digest(token,self.control_token))
    def owns_media(self,r):
        # The launcher keeps the owner credential on the local desktop. Paired devices
        # receive a different controller credential and cannot edit project media.
        token=self.request_token(r)
        return r.app.get('local_owner',False) and bool(token) and secrets.compare_digest(token,self.token)
    async def send(self,line):
        async with self.lock:
            if self.serial and self.serial.is_open: await asyncio.to_thread(self.serial.write,(line+'\n').encode('ascii'))
    async def broadcast(self,line):
        ws=self.controller
        if ws and not ws.closed:
            try:await ws.send_str(line)
            except (ConnectionError,RuntimeError):
                if self.controller is ws:self.controller=None
                with contextlib.suppress(Exception):await self.send('0 STOP')
    async def pump(self):
        buf=''
        while True:
            try:
                if self.serial and self.serial.is_open:
                    data=self.serial.read(min(self.serial.in_waiting,4096))
                    if data:
                        buf+=data.decode('ascii','ignore')
                        while '\n' in buf:
                            line,buf=buf.split('\n',1);await self.broadcast(line.strip())
                        if len(buf)>8192:buf=''
                if self.controller and time.monotonic()-self.last_client>.75:
                    logging.info('Controller heartbeat expired')
                    ws=self.controller;self.controller=None;await self.send('0 STOP');await ws.close(code=1001,message=b'Control timeout')
            except (OSError,RuntimeError,Exception) as e:
                if isinstance(e,asyncio.CancelledError):raise
                logging.warning('USB bridge: %s',e)
                await self.broadcast('FAULT USB_DISCONNECTED')
                if self.serial:
                    with contextlib.suppress(Exception):self.serial.close()
                self.serial=None
            await asyncio.sleep(.01)

@web.middleware
async def protect(r,handler):
    s=r.app['studio'];origin=r.headers.get('Origin')
    if origin and origin != f'{r.scheme}://{r.host}':raise web.HTTPForbidden(text='Origin rejected')
    if r.path.startswith('/api/') or r.path=='/ws':
        if r.path!='/api/pair' and not s.auth(r):raise web.HTTPUnauthorized(text='Pair this device first')
    try:resp=await handler(r)
    except (ValueError,json.JSONDecodeError) as e:raise web.HTTPBadRequest(text=str(e))
    resp.headers['X-Content-Type-Options']='nosniff';resp.headers['Referrer-Policy']='no-referrer';resp.headers['Cache-Control']='no-store'
    return resp

async def index(r):
    if not r.app['studio'].auth(r):
        return web.Response(text=(ROOT/'pair.html').read_text(encoding='utf-8'),content_type='text/html')
    return web.Response(text=(ROOT/'index.html').read_text(encoding='utf-8').replace('<html ', '<html data-bridge="1" ',1),content_type='text/html')
async def pair(r):
    s=r.app['studio'];now=time.monotonic();history=s.pair_attempts.setdefault(r.remote,[]);history[:]=[t for t in history if now-t<60]
    if len(history)>=5:raise web.HTTPTooManyRequests()
    history.append(now);data=await r.json()
    if not secrets.compare_digest(str(data.get('pin','')),s.pin):raise web.HTTPUnauthorized()
    return web.json_response({'token':s.control_token})
ASSETS={'studio.js','robot-view.js','kinematics.js','stl-meshes.js','cartesian.js','planner.js','controller.js','interface.js','project-media.js','i18n.js','pair.js','interface.css','phone-access.js','preview-model.js','assets/favicon.svg'}
async def assets(r):
    name=r.match_info['name']
    if name not in ASSETS:raise web.HTTPNotFound()
    return web.FileResponse(ROOT/name)
async def ports(r):
    import serial.tools.list_ports
    return web.json_response([{'port':p.device,'name':p.description} for p in serial.tools.list_ports.comports()])
async def connect(r):
    import serial,serial.tools.list_ports
    s=r.app['studio'];data=await r.json();port=data.get('port')
    if port not in [p.device for p in serial.tools.list_ports.comports()]:raise ValueError('Select a listed USB port')
    async with s.lock:
        if s.serial and s.serial.is_open:
            if s.serial.port==port:return web.json_response({'ok':True})
            if s.controller:raise web.HTTPConflict(text='Disconnect control before changing USB')
            s.serial.close()
        dev=serial.Serial(port=None,baudrate=115200,timeout=0,write_timeout=.2);dev.dtr=False;dev.rts=False;dev.port=port
        try:await asyncio.to_thread(dev.open)
        except serial.SerialException as e:raise ValueError('USB: '+str(e))
        s.serial=dev
    return web.json_response({'ok':True})
async def websocket(r):
    s=r.app['studio']
    if not s.simulated and not(s.serial and s.serial.is_open):raise web.HTTPConflict(text='Connect USB first')
    ws=web.WebSocketResponse(heartbeat=5,max_msg_size=256);await ws.prepare(r)
    old=s.controller
    if old and old is not ws:
        s.controller=None;await s.send('0 STOP');await old.close(code=1000,message=b'Control moved to another device')
    s.controller=ws;s.controller_scope=r.app;s.last_client=time.monotonic();count=0;window=s.last_client
    try:
        async for m in ws:
            if m.type!=WSMsgType.TEXT:continue
            if s.controller is not ws:break
            now=time.monotonic()
            if now-window>=1:window=now;count=0
            count+=1
            if count>300:await ws.close(code=1008,message=b'Rate limit');break
            line=m.data.strip()
            if len(line)>126 or not re.fullmatch(r'\d+ [A-Z0-9_]+(?: -?\d+)*',line) or line.split()[1] not in OPS:
                await ws.close(code=1008,message=b'Invalid command');break
            s.last_client=now;await s.send(line)
    finally:
        if s.controller is ws:
            s.controller=None
            with contextlib.suppress(Exception):await s.send('0 STOP')
    return ws
async def get_data(r):
    s=r.app['studio'];routines=[json.loads(v[0]) for v in s.db.execute('SELECT data FROM routines ORDER BY updated DESC')]
    kv={k:json.loads(v) for k,v in s.db.execute('SELECT key,data FROM kv')}
    return web.json_response({'routines':routines,**kv})
async def routine(r):
    s=r.app['studio'];name=r.match_info['name']
    if r.method=='DELETE':s.db.execute('DELETE FROM routines WHERE name=?',(name,))
    else:
        data=clean_routine(await r.json())
        if data['name']!=name:raise ValueError('Name mismatch')
        if s.db.execute('SELECT count(*) FROM routines').fetchone()[0]>=100 and not s.db.execute('SELECT 1 FROM routines WHERE name=?',(name,)).fetchone():raise ValueError('100 routines maximum')
        s.db.execute('INSERT INTO routines VALUES(?,?,?) ON CONFLICT(name) DO UPDATE SET data=excluded.data,updated=excluded.updated',(name,json.dumps(data),time.time()))
    s.db.commit();return web.json_response({'ok':True})
async def kv(r):
    key=r.match_info['key']
    if key not in ('draft','settings'):raise web.HTTPBadRequest()
    data=await r.json();s=r.app['studio']
    if not isinstance(data,dict):raise ValueError('Invalid data')
    s.db.execute('INSERT INTO kv VALUES(?,?) ON CONFLICT(key) DO UPDATE SET data=excluded.data',(key,json.dumps(data)));s.db.commit();return web.json_response({'ok':True})
def addresses():
    found=[]
    try:
        with socket.socket(socket.AF_INET,socket.SOCK_DGRAM) as sock:sock.connect(('192.0.2.1',9));found.append(sock.getsockname()[0])
    except OSError:pass
    with contextlib.suppress(OSError):found += [v[4][0] for v in socket.getaddrinfo(socket.gethostname(),None,socket.AF_INET)]
    return list(dict.fromkeys(a for a in found if not a.startswith('127.')))
async def info(r):
    studio=r.app['studio']
    return web.json_response({**studio.phone.status(),'usb':studio.serial.port if studio.serial and studio.serial.is_open else None})
async def phone_access(r):
    studio=r.app['studio']
    if r.method=='POST':
        data=await r.json()
        if not isinstance(data,dict) or type(data.get('enabled')) is not bool:raise ValueError('Expected enabled: true or false')
        try:return web.json_response(await studio.phone.set_enabled(data['enabled']))
        except OSError:raise web.HTTPServiceUnavailable(text='Phone sharing could not start. Check your network connection.')
    return web.json_response(studio.phone.status())
async def qr(r):
    import qrcode,qrcode.image.svg
    urls=(await info(r)).text;url=json.loads(urls)['urls']
    if not url:raise web.HTTPNotFound(text='No LAN IP')
    out=io.BytesIO();qrcode.make(url[0],image_factory=qrcode.image.svg.SvgPathImage).save(out)
    return web.Response(body=out.getvalue(),content_type='image/svg+xml')
async def startup(app):app['studio'].tasks.append(asyncio.create_task(app['studio'].pump()))
async def cleanup(app):
    s=app['studio']
    await s.phone.close()
    with contextlib.suppress(Exception):await s.send('0 STOP')
    if s.controller:await s.controller.close()
    for t in s.tasks:t.cancel()
    for t in s.tasks:
        with contextlib.suppress(asyncio.CancelledError):await t
    if s.serial:s.serial.close()
    s.db.close()

MAX_MEDIA_BYTES=50*1024*1024
MEDIA_TYPES={'image/jpeg':'.jpg','image/png':'.png','image/webp':'.webp','video/mp4':'.mp4','video/webm':'.webm'}
def media_row(studio,ident):
    if not re.fullmatch(r'[a-f0-9]{32}',ident):raise web.HTTPNotFound()
    row=studio.db.execute('SELECT id,name,type,created FROM media WHERE id=?',(ident,)).fetchone()
    if not row:raise web.HTTPNotFound()
    return row
async def list_media(r):
    rows=r.app['studio'].db.execute('SELECT id,name,type,created FROM media ORDER BY created').fetchall()
    return web.json_response([dict(zip(('id','name','type','created'),row)) for row in rows])
async def add_media(r):
    if not r.app['studio'].owns_media(r):raise web.HTTPForbidden(text='Project owner access required')
    studio=r.app['studio'];reader=await r.multipart();part=await reader.next()
    if part is None or part.name!='file':raise ValueError('Choose a photo or video')
    kind=part.headers.get('Content-Type','')
    if kind not in MEDIA_TYPES:raise ValueError('Unsupported media type')
    ident=secrets.token_hex(16);path=studio.media_dir/(ident+MEDIA_TYPES[kind]);size=0
    try:
        with path.open('xb') as output:
            while True:
                chunk=await part.read_chunk(65536)
                if not chunk:break
                size+=len(chunk)
                if size>MAX_MEDIA_BYTES:raise ValueError('Maximum file size is 50 MB')
                output.write(chunk)
        if not size:raise ValueError('Empty media file')
        name=Path((part.filename or 'media').replace(chr(92),'/')).name[:160]
        studio.db.execute('INSERT INTO media VALUES(?,?,?,?)',(ident,name,kind,time.time()));studio.db.commit()
    except BaseException:
        path.unlink(missing_ok=True);raise
    return web.json_response({'id':ident,'name':name,'type':kind},status=201)
async def get_media(r):
    studio=r.app['studio'];row=media_row(studio,r.match_info['id']);path=studio.media_dir/(row[0]+MEDIA_TYPES[row[2]])
    if not path.is_file():raise web.HTTPNotFound()
    resp=web.FileResponse(path);resp.content_type=row[2];resp.headers['Content-Disposition']='inline';return resp
async def delete_media(r):
    if not r.app['studio'].owns_media(r):raise web.HTTPForbidden(text='Project owner access required')
    studio=r.app['studio'];row=media_row(studio,r.match_info['id']);(studio.media_dir/(row[0]+MEDIA_TYPES[row[2]])).unlink(missing_ok=True)
    studio.db.execute('DELETE FROM media WHERE id=?',(row[0],));studio.db.commit();return web.json_response({'ok':True})

async def capabilities(r):
    return web.json_response({'manage_project_media':r.app['studio'].owns_media(r)})

def register_routes(app):
    app.router.add_get('/',index);app.router.add_post('/api/pair',pair);app.router.add_get('/{name:studio.js|robot-view.js|kinematics.js|stl-meshes.js|cartesian.js|planner.js|controller.js|interface.js|project-media.js|i18n.js|pair.js|interface.css|phone-access.js|preview-model.js|assets/favicon.svg}',assets)
    app.router.add_get('/api/ports',ports);app.router.add_post('/api/connect',connect);app.router.add_get('/ws',websocket)
    app.router.add_get('/api/capabilities',capabilities)
    app.router.add_get('/api/media',list_media);app.router.add_post('/api/media',add_media);app.router.add_get('/api/media/{id}',get_media);app.router.add_delete('/api/media/{id}',delete_media)
    app.router.add_get('/api/data',get_data);app.router.add_get('/api/info',info);app.router.add_route('GET','/api/phone',phone_access);app.router.add_route('POST','/api/phone',phone_access);app.router.add_get('/api/qr',qr)
    app.router.add_route('PUT','/api/routines/{name}',routine);app.router.add_route('DELETE','/api/routines/{name}',routine);app.router.add_put('/api/kv/{key}',kv)

def create_shared_app(studio):
    app=web.Application(middlewares=[protect],client_max_size=256*1024)
    app['studio']=studio
    app['local_owner']=False
    register_routes(app)
    return app

def create_app(db,token=None,simulated=False):
    app=web.Application(middlewares=[protect],client_max_size=256*1024)
    studio=Studio(db,token,simulated)
    app['studio']=studio
    app['local_owner']=True
    studio.phone=PhoneSharing(studio,lambda:create_shared_app(studio),addresses)
    register_routes(app)
    app.on_startup.append(startup);app.on_cleanup.append(cleanup)
    return app
if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--port',type=int,default=8765);parser.add_argument('--no-browser',action='store_true');args=parser.parse_args()
    folder=ROOT/'data';folder.mkdir(exist_ok=True);app=create_app(folder/'robot.db');s=app['studio']
    url=f'http://127.0.0.1:{args.port}/?token={s.token}'
    print('\nRobot Arm Studio — keep this window open.\nPairing code:',s.pin,'\nComputer:',url)
    print('Phone access: enable it from the Phone button in the website.')
    if not args.no_browser:webbrowser.open(url)
    web.run_app(app,host='127.0.0.1',port=args.port,print=None)
