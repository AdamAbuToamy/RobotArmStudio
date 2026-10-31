/* Pages, two-axis keyboard controller, database persistence and PC/phone transport. */
const heldKeys=new Map();
let numberAxis=null;
let page='control',verticalIndex=0,storageReady=false,draftTimer;
let keyboard={lr:0,vertical:[1,2,3,4],reverseLR:false,reverseUD:true};
let simConfig={zero:[1100,1030,1650,1640,1400,1480],range:[180,180,180,180,180,120]};
function showPage(name){
  if(!['control','editor','library','simulation','settings','project'].includes(name))return;
  if(heldKeys.size||jog)stopNow(t('توقفت الحركة اليدوية'),true);
  page=name;document.querySelectorAll('.page').forEach(e=>e.hidden=e.id!=='page-'+name);
  document.querySelectorAll('[data-page]').forEach(e=>e.classList.toggle('selected',e.dataset.page===name));
  if(name==='simulation'){window.RobotView?.resize();window.CartesianStudio?.resize();}
  if(name==='library'){renderLibrary();if(storageReady&&BRIDGE)refreshLibraryList();}
  history.replaceState(null,'',location.pathname+location.search+'#'+name);
  document.dispatchEvent(new Event('studio:page')); I18n.apply(document);
}
document.querySelectorAll('[data-page]').forEach(e=>e.onclick=()=>showPage(e.dataset.page));
document.querySelectorAll('.joint-view').forEach(e=>e.onclick=()=>$('joint'+e.dataset.joint).click());
function axisOptions(select,empty=false){
  select.replaceChildren();if(empty)select.add(new Option('—',-1));NAMES.forEach((n,ch)=>select.add(new Option(n,ch)));
}
axisOptions($('keyLR'));axisOptions($('visualJoint'));
for(let i=0;i<6;i++){
  const row=document.createElement('div');row.className='vertical-row';const n=document.createElement('span');n.textContent=i+1;
  const select=document.createElement('select');select.id='vertical'+i;select.setAttribute('aria-label',t('المفصل ')+(i+1)+t(' في ترتيب التبديل'));axisOptions(select,true);row.append(n,select);$('verticalAxes').append(row);
  select.onchange=saveKeyboard;
}
function verticalAxis(){if(numberAxis!==null)return numberAxis;return keyboard.vertical[verticalIndex%Math.max(1,keyboard.vertical.length)]??((keyboard.lr+1)%6);}
function renderMapping(){
  $('mappingLR').textContent='← → / A D '+NAMES[keyboard.lr];$('mappingUD').textContent='↑ ↓ / W S '+NAMES[verticalAxis()];
  $('cycleAxis').disabled=playing||commanding;
}
function renderKeySettings(){
  $('keyLR').value=keyboard.lr;$('reverseLR').checked=keyboard.reverseLR;$('reverseUD').checked=keyboard.reverseUD;
  for(let i=0;i<6;i++)$('vertical'+i).value=keyboard.vertical[i]??-1;
  renderMapping();
}
function saveKeyboard(){
  if(heldKeys.size)stopNow(t('توقفت الحركة اليدوية'),true);
  const lr=Number($('keyLR').value),vertical=[];
  for(let i=0;i<6;i++){const ch=Number($('vertical'+i).value);if(ch>=0&&ch!==lr&&!vertical.includes(ch))vertical.push(ch);}
  if(!vertical.length)vertical.push((lr+1)%6);
  keyboard={lr,vertical,reverseLR:$('reverseLR').checked,reverseUD:$('reverseUD').checked};verticalIndex=0;
  renderKeySettings();persistSettings();
}
$('keyLR').onchange=saveKeyboard;$('reverseLR').onchange=saveKeyboard;$('reverseUD').onchange=saveKeyboard;
function cycleAxis(){numberAxis=null;if(playing||commanding)return;if(heldKeys.size)stopNow(t('توقفت الحركة اليدوية'),true);verticalIndex=(verticalIndex+1)%keyboard.vertical.length;renderMapping();}
$('cycleAxis').onclick=cycleAxis;
function sendKeys(heartbeat=false){
  if(!usable()||playing||commanding)return;
  const keys=[...heldKeys.values()],lr=keyboard.lr,ud=verticalAxis();
  let x=(keys.includes('ArrowRight')?1:0)-(keys.includes('ArrowLeft')?1:0);
  let y=(keys.includes('ArrowUp')?1:0)-(keys.includes('ArrowDown')?1:0);
  if((lr===5&&x)||(ud===5&&y))gripIntent='position';
  if(keyboard.reverseLR)x=-x;if(keyboard.reverseUD)y=-y;
  if(!state.armed[lr]||(lr===5&&state.gripping))x=0;
  if(!state.armed[ud]||(ud===5&&state.gripping))y=0;
  if(lr===ud){transmit(0,`JOG ${lr} ${Math.sign(x+y)} ${Math.min(speed,SPEED_CAPS[lr])}`,heartbeat);return;}
  transmit(0,`JOG2 ${lr} ${x} ${Math.min(speed,SPEED_CAPS[lr])} ${ud} ${y} ${Math.min(speed,SPEED_CAPS[ud])}`,heartbeat);
  document.querySelectorAll('[data-arrow]').forEach(e=>e.classList.toggle('active',keys.includes(e.dataset.arrow)));
}
function releaseKey(source){if(!heldKeys.has(source))return;heldKeys.delete(source);sendKeys();}
function pressKey(source,key){if(!usable()||playing||commanding||!['control','simulation'].includes(page))return;if(jog){stopNow(t('توقفت الحركة اليدوية'),true);}heldKeys.set(source,key);sendKeys();}
function directionKey(e){return ({KeyW:'ArrowUp',KeyS:'ArrowDown',KeyA:'ArrowLeft',KeyD:'ArrowRight'})[e.code]||(/^Arrow(?:Up|Down|Left|Right)$/.test(e.code||e.key)?(e.code||e.key):null);}
window.addEventListener('keydown',e=>{
  if(e.code==='Escape'){e.preventDefault();stopNow(t('توقفت الحركة'));return;}
  if(/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)||e.target.isContentEditable)return;
  if(e.code==='Space'){
    e.preventDefault();if(e.repeat||commanding||!usable()||!state.armed[5])return;
    if(state.gripping)$('openFast').onclick();else $('gripFast').onclick();return;
  }
  if(!['control','simulation'].includes(page))return;
  const digit=e.code.match(/^(?:Digit|Numpad)([1-6])$/);
  if(digit){e.preventDefault();if(e.repeat||playing||commanding)return;const ch=Number(digit[1])-1;
    $('joint'+ch).click();numberAxis=ch;renderMapping();return;
  }
  const arrow=directionKey(e);if(arrow&&!e.ctrlKey&&!e.altKey&&!e.metaKey){e.preventDefault();if(!e.repeat)pressKey('key:'+(e.code||e.key),arrow);}
});
window.addEventListener('keyup',e=>{if(directionKey(e))releaseKey('key:'+(e.code||e.key));});
document.querySelectorAll('[data-arrow]').forEach(b=>{
  b.onpointerdown=e=>{if(e.button!==0)return;e.preventDefault();b.setPointerCapture?.(e.pointerId);pressKey('pointer:'+e.pointerId,b.dataset.arrow);};
  for(const ev of ['pointerup','pointercancel','lostpointercapture'])b.addEventListener(ev,e=>releaseKey('pointer:'+e.pointerId));
  b.oncontextmenu=e=>e.preventDefault();
});
function syncSimulationDirections(directions){
 if(!Array.isArray(directions)||directions.length!==6)return;
 const scales=window.CartesianStudio?.snapshot()?.scales||window.pendingCartesianConfig?.scales||[.5,.5,.5,.5,.5,.5];
 simConfig.range=[180,180,180,180,180,120].map((v,i)=>v*scales[i]);
 visualSigns=[-1,1,-1,1,1,1].map((base,i)=>base*(directions[i]===-1?-1:1));
 window.RobotView?.configure(simConfig,visualSigns,window.CartesianStudio?.snapshot()||window.pendingCartesianConfig);
 visualSettings();
}
function visualSettings(){const ch=Number($('visualJoint').value);$('visualFlip').checked=(window.CartesianStudio?.snapshot()?.directions||window.pendingCartesianConfig?.directions||[])[ch]===-1;$('simZero').min=LIMITS[ch][0];$('simZero').max=LIMITS[ch][1];$('simZero').value=simConfig.zero[ch];$('simRange').value=Math.round((window.CartesianStudio?.snapshot()?.scales?.[ch]??.5)*100);}
$('visualJoint').onchange=visualSettings;
$('simZero').onchange=()=>{const c=Number($('visualJoint').value),v=Number($('simZero').value);if(Number.isFinite(v)&&v>=LIMITS[c][0]&&v<=LIMITS[c][1])simConfig.zero[c]=v;visualSettings();persistSettings();};
$('simRange').onchange=()=>{window.CartesianStudio?.setScale(Number($('visualJoint').value),Number($('simRange').value)/100);visualSettings();};
$('simCalibrate').onclick=()=>{if(!usable())return;simConfig.zero[Number($('visualJoint').value)]=state.p[Number($('visualJoint').value)];visualSettings();persistSettings();};
$('simStop').onclick=()=>stopNow(t('توقفت الحركة'));
$('settingsGrip').onchange=()=>{const v=Number($('settingsGrip').value);if(Number.isInteger(v)&&v>=810&&v<=1710){$('gripTarget').value=v;localStorage.setItem('robot-grip-target',String(v));persistSettings();}};
if(!$('gripTarget').value)$('gripTarget').value=1710;
$('settingsGrip').value=$('gripTarget').value;
$('gripTarget').onchange=()=>{$('settingsGrip').value=$('gripTarget').value;persistSettings();};
function settingsSnapshot(){return {keyboard,simConfig,visualSigns,cartesian:window.CartesianStudio?.snapshot()||window.pendingCartesianConfig,gripTarget:Number($('gripTarget').value)};}
function applySettings(s){
  if(!s||typeof s!=='object')return;
  if(s.cartesian){window.pendingCartesianConfig=s.cartesian;window.CartesianStudio?.configure(s.cartesian);}
  const k=s.keyboard;
  if(k&&Number.isInteger(k.lr)&&k.lr>=0&&k.lr<6&&Array.isArray(k.vertical)){
    const vertical=[...new Set(k.vertical.filter(v=>Number.isInteger(v)&&v>=0&&v<6&&v!==k.lr))];
    keyboard={lr:k.lr,vertical:vertical.length?vertical:[(k.lr+1)%6],reverseLR:!!k.reverseLR,reverseUD:!!k.reverseUD};verticalIndex=0;
  }
  if(s.simConfig&&['zero','range'].every(k=>Array.isArray(s.simConfig[k])&&s.simConfig[k].length===6)){
    const c=s.simConfig;if(c.zero.every((v,i)=>Number.isFinite(v)&&v>=LIMITS[i][0]&&v<=LIMITS[i][1])&&c.range.every(v=>Number.isFinite(v)&&v>=10&&v<=270))simConfig=c;
  }
  if(Array.isArray(s.visualSigns)&&s.visualSigns.length===6&&s.visualSigns.every(v=>v===1||v===-1))visualSigns=s.visualSigns;
  if(Number.isInteger(s.gripTarget)&&s.gripTarget>=810&&s.gripTarget<=1710)$('gripTarget').value=$('settingsGrip').value=s.gripTarget;
  renderKeySettings();syncSimulationDirections(window.CartesianStudio?.snapshot()?.directions||window.pendingCartesianConfig?.directions||[1,1,1,1,1,1]);visualSettings();window.RobotView?.configure(simConfig,visualSigns,window.CartesianStudio?.snapshot()||window.pendingCartesianConfig);
}
async function persistSettings(){
  syncSimulationDirections(window.CartesianStudio?.snapshot()?.directions||window.pendingCartesianConfig?.directions||[1,1,1,1,1,1]);
  window.RobotView?.configure(simConfig,visualSigns,window.CartesianStudio?.snapshot()||window.pendingCartesianConfig);
  try{localStorage.setItem('robot-studio-settings',JSON.stringify(settingsSnapshot()));if(storageReady)await motionDB.kv('settings',settingsSnapshot());}catch(e){message(t('تعذّر حفظ الإعدادات: ')+e.message);}
}
const motionDB={
  db:null,
  async api(path,method='GET',data){const r=await fetch(path,{method,headers:{Authorization:'Bearer '+AUTH,'Content-Type':'application/json'},...(data!==undefined?{body:JSON.stringify(data)}:{})});if(!r.ok)throw Error(await r.text());return r.json();},
  async init(){
    if(BRIDGE)return this.api('/api/data');
    if(!window.indexedDB){this.fallback=true;return JSON.parse(localStorage.getItem('robot-studio-db')||'{}');}
    this.db=await new Promise((resolve,reject)=>{const r=indexedDB.open('robot-arm-studio',1);r.onupgradeneeded=()=>{const d=r.result;d.createObjectStore('routines',{keyPath:'name'});d.createObjectStore('kv');};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
    const routines=await this.transaction('routines','readonly',s=>s.getAll());const draft=await this.transaction('kv','readonly',s=>s.get('draft'));const settings=await this.transaction('kv','readonly',s=>s.get('settings'));return {routines,draft,settings};
  },
  transaction(store,mode,fn){return new Promise((resolve,reject)=>{const t=this.db.transaction(store,mode);let result;const req=fn(t.objectStore(store));req.onsuccess=()=>{result=req.result;};t.oncomplete=()=>resolve(result);t.onerror=()=>reject(t.error);t.onabort=()=>reject(t.error||Error('Storage aborted'));});},
  async put(r){if(BRIDGE)return this.api('/api/routines/'+encodeURIComponent(r.name),'PUT',r);if(this.fallback){const d=JSON.parse(localStorage.getItem('robot-studio-db')||'{}');d.routines=[...(d.routines||[]).filter(v=>v.name!==r.name),r];localStorage.setItem('robot-studio-db',JSON.stringify(d));return;}return this.transaction('routines','readwrite',s=>s.put(r));},
  async remove(name){if(BRIDGE)return this.api('/api/routines/'+encodeURIComponent(name),'DELETE');if(this.fallback){const d=JSON.parse(localStorage.getItem('robot-studio-db')||'{}');d.routines=(d.routines||[]).filter(v=>v.name!==name);localStorage.setItem('robot-studio-db',JSON.stringify(d));return;}return this.transaction('routines','readwrite',s=>s.delete(name));},
  async kv(key,v){if(BRIDGE)return this.api('/api/kv/'+key,'PUT',v);if(this.fallback){const d=JSON.parse(localStorage.getItem('robot-studio-db')||'{}');d[key]=v;localStorage.setItem('robot-studio-db',JSON.stringify(d));return;}return this.transaction('kv','readwrite',s=>s.put(v,key));}
};
function queueDraftSave(){if(!storageReady)return;clearTimeout(draftTimer);draftTimer=setTimeout(async()=>{try{await motionDB.kv('draft',currentRoutine());$('saveState').textContent=t('حُفظت المسودة');}catch(e){$('saveState').textContent=t('تعذّر حفظ المسودة');}},350);}
$('routineName').addEventListener('input',queueDraftSave);$('pathMode').onchange=()=>{queueDraftSave();};
function renderLibrary(){
  const box=$('libraryCards');box.replaceChildren();
  for(const r of Object.values(routines)){
    const card=document.createElement('article');card.className='routine-card';const name=document.createElement('h3');name.textContent=r.name;name.dataset.userContent='true';
    const info=document.createElement('span');info.className='muted';info.textContent=r.poses.length+t(' وضعيات');
    const row=document.createElement('div');row.className='row';
    for(const [label,fn] of [[t('فتح'),()=>loadRoutine(r.name)],[t('تشغيل'),()=>{loadRoutine(r.name,false);playSequence(poses,playbackRate,$('scalePauses').checked);}],[t('حذف'),async()=>{if(!confirm(t('حذف ')+r.name+t('؟')))return;try{await motionDB.remove(r.name);delete routines[r.name];refreshSaved();renderLibrary();}catch(e){message(e.message);}}]]){
      const b=document.createElement('button');b.textContent=label;if(label===t('تشغيل'))b.dataset.requiresAll='1';b.onclick=fn;b.disabled=playing||commanding||(label===t('تشغيل')&&!both());row.append(b);
    }
    card.append(name,info,row);box.append(card);
  }
  if(!box.childNodes.length){const e=document.createElement('div');e.className='empty';e.textContent=t('لا توجد حركات محفوظة');box.append(e);}
}
async function refreshLibraryList(){
  try{const d=await motionDB.api('/api/data');const next=Object.create(null);for(const r of d.routines||[]){try{const clean=validateRoutine(r);next[clean.name]=clean;}catch{}}routines=next;refreshSaved();renderLibrary();}catch(e){message(t('تعذّر تحديث الحركات: ')+e.message);}
}
function loadRoutine(name,navigate=true){
  if(playing||commanding)return;
  const r=routines[name];if(!r)return;const clean=validateRoutine(r);poses=clean.poses;$('routineName').value=clean.name;$('pathMode').value=clean.mode;renderPoses();if(navigate)showPage('editor');message(t('حُمّلت الحركة'));
}
$('newRoutine').onclick=()=>{if(playing||commanding)return;poses=[];$('routineName').value='';$('pathMode').value='flow';renderPoses();showPage('editor');};
async function refreshStorage(){
  if(playing||commanding)return;
  try{
    const old=routines,data=await motionDB.init();routines=Object.create(null);
    for(const r of data.routines||[]){try{const c=validateRoutine(r);routines[c.name]=c;}catch{}}
    if(!Object.keys(routines).length&&Object.keys(old).length){for(const r of Object.values(old)){const c=validateRoutine(r);await motionDB.put(c);routines[c.name]=c;}}
    if(data.settings)applySettings(data.settings);else{try{applySettings(JSON.parse(localStorage.getItem('robot-studio-settings')||'null'));}catch{}}
    if(data.draft){try{const c=validateRoutine(data.draft);poses=c.poses;$('routineName').value=c.name;$('pathMode').value=c.mode;}catch{}}
    storageReady=true;refreshSaved();renderLibrary();renderPoses();$('storageState').textContent=BRIDGE?t('SQLite · محفوظ على الكمبيوتر'):motionDB.fallback?t('حفظ المتصفح'):t('IndexedDB · محفوظ في المتصفح');
  }catch(e){message(t('تعذّر فتح التخزين: ')+e.message);$('storageState').textContent=t('التخزين غير متاح');}
}
$('refreshLibrary').onclick=refreshStorage;
async function refreshPorts(){try{const ports=await motionDB.api('/api/ports');const old=$('usbPort').value;$('usbPort').replaceChildren();for(const p of ports)$('usbPort').add(new Option(p.port+' · '+p.name,p.port));if(ports.some(p=>p.port===old))$('usbPort').value=old;}catch(e){message(e.message);}}
$('refreshPorts').onclick=refreshPorts;
async function connectBridge(){
  opening=true;render();
  try{
    const port=$('usbPort').value;if(!port)throw Error(t('اختر منفذ USB من القائمة'));
    await motionDB.api('/api/connect','POST',{port});
    const url=new URL('/ws',location.href);url.protocol=location.protocol==='https:'?'wss:':'ws:';url.searchParams.set('token',AUTH);
    bridgeSocket=new WebSocket(url);const socket=bridgeSocket;
    await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error(t('تعذّر ربط الكمبيوتر'))),4000);socket.onopen=()=>{clearTimeout(t);resolve();};socket.onerror=()=>{clearTimeout(t);reject(Error(t('تعذّر الاتصال')));};});
    writer={write:async bytes=>{if(socket.readyState!==WebSocket.OPEN)throw Error(t('الاتصال مغلق'));socket.send(new TextDecoder().decode(bytes).trim());},releaseLock(){}};
    socket.onmessage=e=>{for(const line of e.data.split('\n'))handleLine(line.trim());};
    socket.onclose=e=>{if(!closing&&linked){writer=null;fail(e.reason==='Control timeout'?t('تأخر الاتصال؛ توقفت الحركة'):e.reason==='Control moved to another device'?t('استلم جهاز آخر التحكم'):t('انقطع التحكم (')+e.code+')');}};
    linked=true;protocol=false;stateSeq=0;state.ready=false;state.armed=Array(6).fill(false);lastState=performance.now();nextId=1;writeChain=Promise.resolve();pendingWrites=0;
    for(let i=0;i<12&&linked&&(!protocol||!stateSeqFresh());i++){transmit(0,'HELLO');await delay(250);}
    if(!stateSeqFresh())throw Error(t('ارفع برنامج v20 وأغلق Serial Monitor'));message(t('متصل عبر الكمبيوتر'));
  }catch(e){message(e.message);await disconnect(false);}finally{opening=false;render();}
}
async function setupPhone(){
  if(!BRIDGE)return;
  $('usbPort').hidden=$('refreshPorts').hidden=false;
  $('connect').textContent=t('اتصال');await refreshPorts();
  $('phoneSetup').textContent=t('فعّل استخدام الهاتف من زر الهاتف أعلى الموقع.');
}
renderKeySettings();visualSettings();renderPoses();refreshStorage();setupPhone();
showPage(location.hash.slice(1)||'control');

// Limits are authoritative on the ESP, persisted there and reported on every connection.
axisOptions($('limitJoint'));$('limitJoint').remove(5);
function renderLimitSettings(){
  const c=Number($('limitJoint').value)||0;
  $('limitMin').value=LIMITS[c][0];$('limitMax').value=LIMITS[c][1];
  if(typeof visualSettings==='function')visualSettings();
}
$('limitJoint').onchange=renderLimitSettings;
$('limitWider').onclick=()=>{
  $('limitMin').value=Math.max(500,Number($('limitMin').value)-25);
  $('limitMax').value=Math.min(2500,Number($('limitMax').value)+25);
};
$('limitReset').onclick=()=>{$('limitMin').value=800;$('limitMax').value=2200;};
$('limitApply').onclick=async()=>{
  const c=Number($('limitJoint').value),lo=Number($('limitMin').value),hi=Number($('limitMax').value);
  const home=[1100,1030,1650,1640,1400];
  if(!usable()||playing||commanding||state.moving||state.gripping)return;
  if(!Number.isInteger(lo)||!Number.isInteger(hi)||lo<500||hi>2500||lo>=hi||lo>home[c]||hi<home[c]||state.p[c]<lo||state.p[c]>hi){message(t('الحدود يجب أن تشمل الموضع الحالي ووضع التفعيل، ضمن 500–2500.'));return;}
  commanding=true;render();
  try{await request(`LIMITS ${c} ${lo} ${hi}`);message(t('حُفظت حدود ')+NAMES[c]+t('؛ الحفظ لا يحرّك المحرك.'));}
  catch(e){message(e.message);}finally{commanding=false;render();}
};
renderLimitSettings();

$('holdMG90').onchange=async()=>{
 const checked=$('holdMG90').checked;
 try{await request('HOLD90 '+(checked?1:0));message(checked?t('التثبيت للحركات التالية؛ راقب الطنين والسخونة.'):t('وضع الراحة: تتوقف نبضات MG90S بعد ثبات الأمر.'));}
 catch(e){$('holdMG90').checked=!!state.holdMG90;message(e.message);}
};
