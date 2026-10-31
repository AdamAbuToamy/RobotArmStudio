"""Backend regression checks, isolated temporary data and no physical serial ports."""
import io,sys,tempfile,unittest
from pathlib import Path
from unittest.mock import patch, AsyncMock
from aiohttp import FormData, ClientSession, WSMsgType
from aiohttp.test_utils import TestClient,TestServer
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import server

class ServerChecks(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.folder=tempfile.TemporaryDirectory(prefix='arm-studio-api-')
        self.app=server.create_app(Path(self.folder.name)/'robot.db',token='test-token',simulated=True)
        self.client=TestClient(TestServer(self.app));await self.client.start_server()
        self.auth={'Authorization':'Bearer test-token'}
    async def asyncTearDown(self):
        await self.client.close();self.folder.cleanup()
    async def test_pairing_and_assets(self):
        resp=await self.client.get('/');self.assertIn('pairCode',await resp.text())
        for name in ['interface.css','controller.js','i18n.js','planner.js','assets/favicon.svg']:
            with self.subTest(asset=name):self.assertEqual((await self.client.get('/'+name)).status,200)
        self.assertEqual((await self.client.get('/api/data')).status,401)
        bad=await self.client.post('/api/pair',json={'pin':'invalid'});self.assertEqual(bad.status,401)
        good=await self.client.post('/api/pair',json={'pin':self.app['studio'].pin});token=(await good.json())['token'];self.assertEqual(token,self.app['studio'].control_token);self.assertNotEqual(token,'test-token')
    async def test_routine_roundtrip_and_validation(self):
        routine={'version':6,'name':'حركة تجريبية','mode':'flow','poses':[{'name':'Pose','p':[1100,1030,1650,1640,1400,1480],'moveMs':2000,'holdMs':0,'grip':{'action':'position','target':1480,'settleMs':0}}]}
        url='/api/routines/'+routine['name'];self.assertEqual((await self.client.put(url,json=routine,headers=self.auth)).status,200)
        data=await (await self.client.get('/api/data',headers=self.auth)).json();self.assertEqual(data['routines'][0],routine)
        bad={**routine,'poses':[dict(routine['poses'][0],p=[0,0,0,0,0,0])]}
        self.assertEqual((await self.client.put(url,json=bad,headers=self.auth)).status,400)
        self.assertEqual((await self.client.delete(url,headers=self.auth)).status,200)
    async def test_media_storage_auth_range_and_delete(self):
        body=FormData();body.add_field('file',io.BytesIO(b'video-test-data'*80000),filename='physical-video.mp4',content_type='video/mp4')
        response=await self.client.post('/api/media',data=body,headers=self.auth);self.assertEqual(response.status,201)
        entry=await response.json();url='/api/media/'+entry['id']
        self.assertEqual((await self.client.get(url)).status,401)
        media=await self.client.get(url,headers={**self.auth,'Range':'bytes=0-9'});self.assertEqual(media.status,206);self.assertEqual(len(await media.read()),10)
        self.assertEqual((await self.client.delete(url,headers=self.auth)).status,200)
        self.assertEqual((await self.client.get(url,headers=self.auth)).status,404)
    async def test_invalid_and_oversize_uploads_cleanup(self):
        for kind in ['text/html','image/svg+xml','application/octet-stream']:
            body=FormData();body.add_field('file',b'<script>bad</script>',filename='bad.html',content_type=kind)
            self.assertEqual((await self.client.post('/api/media',data=body,headers=self.auth)).status,400)
        body=FormData();body.add_field('file',b'x'*2048,filename='large.mp4',content_type='video/mp4')
        with patch.object(server,'MAX_MEDIA_BYTES',1024):
            self.assertEqual((await self.client.post('/api/media',data=body,headers=self.auth)).status,400)
        self.assertEqual(list(self.app['studio'].media_dir.iterdir()),[])
    async def test_phone_listener_opt_in_pairing_and_shutdown(self):
        phone=self.app['studio'].phone
        phone.address_provider=lambda:['127.0.0.1']
        initial=await (await self.client.get('/api/phone',headers=self.auth)).json()
        self.assertFalse(initial['enabled'])
        self.assertEqual((await self.client.post('/api/phone',json={'enabled':True})).status,401)
        enabled=await (await self.client.post('/api/phone',json={'enabled':True},headers=self.auth)).json()
        self.assertTrue(enabled['enabled']);self.assertEqual(len(self.app['studio'].tasks),1)
        same=await (await self.client.post('/api/phone',json={'enabled':True},headers=self.auth)).json()
        self.assertEqual(same['port'],enabled['port'])
        url='http://127.0.0.1:'+str(enabled['port'])
        self.app['studio'].send=AsyncMock()
        async with ClientSession() as session:
            page=await session.get(url+'/');self.assertIn('pairCode',await page.text())
            pair=await session.post(url+'/api/pair',json={'pin':enabled['pin']});token=(await pair.json())['token'];self.assertEqual(token,self.app['studio'].control_token)
            self.assertNotIn('test-token',enabled['urls'][0])
            ws=await session.ws_connect(url+'/ws?token='+token)
            disabled=await self.client.post('/api/phone',json={'enabled':False},headers=self.auth)
            self.assertFalse((await disabled.json())['enabled'])
            close=await ws.receive(timeout=1);self.assertIn(close.type,[WSMsgType.CLOSE,WSMsgType.CLOSED])
            self.app['studio'].send.assert_any_await('0 STOP')
        self.assertEqual((await self.client.get('/api/data',headers=self.auth)).status,200)
        await phone.close()

    async def test_controller_can_view_media_but_cannot_upload_or_delete(self):
        owner=await (await self.client.get('/api/capabilities',headers=self.auth)).json()
        self.assertTrue(owner['manage_project_media'])
        pair=await self.client.post('/api/pair',json={'pin':self.app['studio'].pin})
        controller={'Authorization':'Bearer '+(await pair.json())['token']}
        role=await (await self.client.get('/api/capabilities',headers=controller)).json()
        self.assertFalse(role['manage_project_media'])
        body=FormData();body.add_field('file',b'photo-fixture',filename='build.png',content_type='image/png')
        added=await self.client.post('/api/media',data=body,headers=self.auth)
        self.assertEqual(added.status,201);ident=(await added.json())['id']
        listing=await (await self.client.get('/api/media',headers=controller)).json()
        self.assertEqual(listing[0]['id'],ident)
        self.assertEqual((await self.client.get('/api/media/'+ident,headers=controller)).status,200)
        # Explicit API calls fail too, regardless of whether a client reveals hidden controls.
        self.assertEqual((await self.client.post('/api/media',headers=controller,data=b'fake-upload')).status,403)
        self.assertEqual((await self.client.delete('/api/media/'+ident,headers=controller)).status,403)
        self.assertEqual((await self.client.get('/api/media/'+ident,headers=self.auth)).status,200)
        self.assertEqual((await self.client.delete('/api/media/'+ident,headers=self.auth)).status,200)

    async def test_lan_never_exposes_owner_media_editing(self):
        studio=self.app['studio'];studio.phone.address_provider=lambda:['127.0.0.1']
        state=await studio.phone.set_enabled(True)
        url='http://127.0.0.1:'+str(state['port'])
        async with ClientSession() as session:
            for token in [studio.token,studio.control_token]:
                auth={'Authorization':'Bearer '+token}
                role=await (await session.get(url+'/api/capabilities',headers=auth)).json()
                self.assertFalse(role['manage_project_media'])
                self.assertEqual((await session.post(url+'/api/media',headers=auth,data=b'fake')).status,403)
                self.assertEqual((await session.delete(url+'/api/media/'+'0'*32,headers=auth)).status,403)
                self.assertEqual((await session.get(url+'/api/data',headers=auth)).status,200)
        await studio.phone.close()

    async def test_state_input_limits_and_origin(self):
        response=await self.client.put('/api/kv/unknown',json={},headers=self.auth);self.assertEqual(response.status,400)
        response=await self.client.get('/api/data',headers={**self.auth,'Origin':'https://unrelated.invalid'});self.assertEqual(response.status,403)
        response=await self.client.put('/api/kv/settings',json={'padding':'x'*300000},headers=self.auth);self.assertEqual(response.status,413)

if __name__=='__main__':unittest.main()
