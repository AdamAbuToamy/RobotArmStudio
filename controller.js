

const $ = id => document.getElementById(id);
const ENVELOPE=[[500,2500],[500,2500],[500,2500],[500,2500],[500,2500],[810,1710]];
const LIMITS = [[800,2200],[800,2200],[800,2200],[800,2200],[800,2200],[810,1710]];
const SPEED_CAPS=[4000,4000,4000,600,600,250];
const AXES=6;
const BRIDGE=document.documentElement.dataset.bridge==='1';
const AUTH=new URLSearchParams(location.search).get('token')||sessionStorage.getItem('robot-token')||'';
if(AUTH)sessionStorage.setItem('robot-token',AUTH);
let bridgeSocket=null;

let visualSigns=[-1,1,-1,1,1,1];
try{const v=JSON.parse(localStorage.getItem('robot-visual-signs')||'null');if(Array.isArray(v)&&v.length===6&&v.every(x=>x===1||x===-1))visualSigns=v;}catch{}
function effectiveSpeed(){return Math.min(speed,SPEED_CAPS[selected]);}
const NAMES = [t("القاعدة"), t("الكتف"), t("الكوع"), t("إمالة الرسغ"), t("دوران المقبض"), t("الأصابع")];
const STORE = 'robot-arm-studio-v4-routines';
let playbackRate=1;
try{const v=Number(localStorage.getItem('robot-playback-rate'));if(Number.isFinite(v)&&v>=0.25&&v<=4)playbackRate=Math.round(v*4)/4;}catch{}
function renderPlaybackRate(){
  $('playbackRate').value=playbackRate;
  $('playbackRateValue').textContent=playbackRate+'×';
  document.querySelectorAll('[data-playback-rate]').forEach(b=>b.classList.toggle('selected',Number(b.dataset.playbackRate)===playbackRate));
}
function setPlaybackRate(value){
  if(playing||commanding)return;
  const v=Number(value);if(!Number.isFinite(v))return;
  playbackRate=Math.max(0.25,Math.min(4,Math.round(v*4)/4));
  try{localStorage.setItem('robot-playback-rate',String(playbackRate));}catch{}
  renderPlaybackRate();
}
$('playbackRate').oninput=()=>setPlaybackRate($('playbackRate').value);
document.querySelectorAll('[data-playback-rate]').forEach(b=>b.onclick=()=>setPlaybackRate(b.dataset.playbackRate));
renderPlaybackRate();
let port, reader, writer, readTask;
let linked=false, protocol=false, closing=false, opening=false;
let state={p:[1500,1500,1500,1500,1500,1500], armed:Array(AXES).fill(false), ready:false, moving:false, gripping:false};
let stateSeq=0, lastState=0, selected=0, speed=450, jog=0;
let manualSpeed=false, presetSpeed=450;
let gripIntent='position';
let poses=[], routines=Object.create(null), playing=false, playToken=0, activePose=-1, commanding=false;
let nextId=1, pendingWrites=0, writeChain=Promise.resolve();
const pending=new Map(), completed=new Map();
const enc=new TextEncoder();
function message(text){const concise=userMessage(text);$('status').textContent=concise;$('status').hidden=!concise;}
function log(text){$('log').textContent=($('log').textContent+'\n'+text).split('\n').slice(-35).join('\n');}
function usable(){return linked && protocol && state.ready && performance.now()-lastState<900;}
function both(){return usable() && state.armed.every(Boolean);}
function render(){
  const ok=usable();
  const busy=playing||commanding;
  $('holdMG90').disabled=!ok||busy;
  $('limitApply').disabled=!ok||busy||state.moving||state.gripping;
  $('playbackRate').disabled=busy; $('scalePauses').disabled=busy;
  document.querySelectorAll('[data-playback-rate]').forEach(b=>b.disabled=busy);
  $('openFast').disabled=!ok||!state.armed[5]||commanding;
  $('gripFast').disabled=!ok||!state.armed[5]||commanding;
  $('grip').textContent=t('إغلاق');
  $('grip').disabled=!ok||!state.armed[5]||busy||state.gripping;
  $('releaseGrip').disabled=!ok||!state.armed[5];
  $('gripTarget').disabled=busy||state.gripping;
  $('connect').disabled=linked||opening;
  $('disconnect').disabled=!linked||closing;
  $('stop').disabled=!linked;
  $('armAll').disabled=!ok||busy;
  $('arm').disabled=!ok||busy||state.armed[selected];
  $('initialize').disabled=!ok||busy||!$('initSupported').checked||state.armed[selected];
  $('initPulse').disabled=busy;
  $('arm').textContent=state.armed[selected]?t('مفعّل'):t('تفعيل');
  for(const id of ['left','right']) $(id).disabled=!ok||!state.armed[selected]||busy||(selected===5&&state.gripping);
  for(const id of ['capture','center']) $(id).disabled=!both()||busy;
  $('play').disabled=!both()||!poses.length||busy;
  for(const id of ['save','load','clear','import','routineName','saved']) $(id).disabled=busy;
  $('export').disabled=!poses.length||playing;
  for(let i=0;i<AXES;i++){
    $('joint'+i).disabled=busy;
    $('joint'+i).classList.toggle('selected',selected===i);
    $('p'+i).textContent=ok?state.p[i]+' µs':'—';
    $('bar'+i).max=LIMITS[i][1]-LIMITS[i][0];
    $('bar'+i).value=ok?state.p[i]-LIMITS[i][0]:0;
    $('a'+i).textContent=ok?(state.armed[i]?t('مفعّل'):t('غير مفعّل')):'';
  }
  $('left').classList.toggle('active',jog===-1);
  $('right').classList.toggle('active',jog===1);
  $('jointTitle').textContent=NAMES[selected];
  $('jointRange').textContent=LIMITS[selected].join(' — ')+' µs';
  for(let i=0;i<AXES;i++)$('view'+i).classList.toggle('chosen',selected===i);
  if(window.RobotView)RobotView.update(state.p);
  window.CartesianStudio?.onState(state);
  renderMapping();
  document.querySelectorAll('[data-requires-all]').forEach(b=>b.disabled=!both()||busy);
  document.querySelectorAll('[data-arrow]').forEach(b=>b.classList.toggle('active',[...heldKeys.values()].includes(b.dataset.arrow)));
  $('left').textContent=selected===0?t('← يسار'):t('↶ اتجاه 1');
  $('right').textContent=selected===0?t('يمين →'):t('اتجاه 2 ↷');
  $('badge').classList.toggle('live',ok);
  $('badge').textContent=!linked?t('● غير متصل'):!protocol?t('● جارٍ الاتصال'):!state.ready?t('● غير جاهز'):!ok?t('● انقطع الاتصال'):t('● متصل');
  document.querySelectorAll('.pose input,.pose button,.pose select').forEach(e=>e.disabled=playing||commanding);
  document.querySelectorAll('.pose').forEach(li=>{const g=poses[Number(li.dataset.index)]?.grip;if(!g)return;li.querySelector('.gripPulse').disabled=busy||['keep','release'].includes(g.action);li.querySelector('.gripSettle').disabled=busy||!['grab','open'].includes(g.action);});
}
function validateRoutine(data){
  if(data && [2,3].includes(data.version) && Array.isArray(data.poses)){
    const count=data.version===2?2:3;
    if(data.poses.some(p=>!p||!Array.isArray(p.p)||p.p.length!==count))throw Error(t('ملف قديم غير صالح.'));
    data={...data,version:4,poses:data.poses.map(p=>({...p,p:[...p.p,...Array(AXES-count).fill(null)]}))};
  }
  if(!data||![4,5,6].includes(data.version)||typeof data.name!=='string'||data.name.length>60||!Array.isArray(data.poses)||data.poses.length>100) throw Error(t('ملف الحركة غير صالح أو أكبر من 100 وضعية.'));
  const clean=data.poses.map((p,i)=>{
    if(!p||typeof p.name!=='string'||p.name.length>60||!Array.isArray(p.p)||p.p.length!==AXES||p.p.some((v,ch)=>v!==null&&(!Number.isInteger(v)||v<ENVELOPE[ch][0]||v>ENVELOPE[ch][1]))||!Number.isInteger(p.moveMs)||p.moveMs<200||p.moveMs>30000||!Number.isInteger(p.holdMs)||p.holdMs<0||p.holdMs>30000) throw Error(t('قيم غير صالحة في الوضعية ')+(i+1));
    let grip={action:'position',target:p.p[5]??1500,settleMs:0};
    if(p.grip!==undefined){
      const g=p.grip;
      if(!g||!['position','keep','grab','open','release'].includes(g.action)||!Number.isInteger(g.target)||g.target<810||g.target>1710||!Number.isInteger(g.settleMs)||g.settleMs<0||g.settleMs>2000)throw Error(t('أمر مقبض غير صالح في الوضعية ')+(i+1));
      grip={...g};
    }
    return {name:p.name,p:[...p.p],moveMs:p.moveMs,holdMs:p.holdMs,grip};
  });
  return {version:6,name:data.name,poses:clean,mode:['flow','pauses','steps'].includes(data.mode)?data.mode:(data.version<5?'pauses':'flow')};
}
function currentRoutine(){return validateRoutine({version:6,name:$('routineName').value.trim()||t('حركة جديدة'),poses,mode:$('pathMode').value});}
function refreshSaved(){
  $('saved').replaceChildren(new Option(t('الحركات المحفوظة…'),''));
  Object.keys(routines).forEach(name=>$('saved').add(new Option(name,name)));
}
try{
  const raw=JSON.parse(localStorage.getItem(STORE)||localStorage.getItem('robot-arm-studio-v3-routines')||localStorage.getItem('robot-arm-studio-v2-routines')||'[]');
  if(Array.isArray(raw)) raw.slice(0,100).forEach(r=>{try{const clean=validateRoutine(r);routines[clean.name]=clean;}catch{}});
}catch{message(t('تعذّرت قراءة الحفظ المحلي. يمكنك استخدام تصدير JSON.'));}
refreshSaved();
function renderPoses(){
  $('poses').replaceChildren();
  poses.forEach((pose,index)=>{
    const li=document.createElement('li');li.className='pose';li.dataset.index=index;
    li.classList.toggle('playing',index===activePose);
    li.innerHTML=t('<span class="stepno"></span><div><input class="poseName" maxlength="60" aria-label="اسم الوضعية"><small class="poseValues" hidden></small></div><label>انتقال / ث<input class="duration" type="number" min="0.2" max="30" step="0.1"></label><label>انتظار / ث<input class="hold" type="number" min="0" max="30" step="0.1"></label><div class="grip-editor"><label>المقبض<select class="gripAction"><option value="position">موضع محفوظ</option><option value="keep">دون تغيير</option><option value="grab">إمساك مستمر</option><option value="open">فتح / إفلات</option><option value="release">إرخاء المقبض</option></select></label><details class="pose-advanced"><summary>خيارات متقدمة</summary><div class="grip-params"><label>µs<input class="gripPulse" type="number" min="810" max="1710"></label><label>استقرار / ث<input class="gripSettle" type="number" min="0" max="2" step="0.05"></label></div></details></div><div class="tools"><button class="up" aria-label="تقديم الوضعية">↑</button><button class="down" aria-label="تأخير الوضعية">↓</button><button class="delete" aria-label="حذف الوضعية">حذف</button></div>');
    li.querySelector('.stepno').textContent=index+1;
    li.querySelector('.poseName').value=pose.name;
    li.querySelector('.poseName').onchange=e=>{pose.name=e.target.value.slice(0,60);queueDraftSave();};
    li.querySelector('.poseValues').textContent=pose.p.map((v,i)=>i+': '+(v===null?t('ثابت'):v)).join(' · ');
    for(const [cls,key,min] of [['duration','moveMs',200],['hold','holdMs',0]]){
      const el=li.querySelector('.'+cls);el.value=pose[key]/1000;
      el.onchange=()=>{const v=Math.round(Number(el.value)*1000);if(el.value===''||!Number.isFinite(v)||v<min||v>30000){message(t('المدة خارج المجال المقبول.'));el.value=pose[key]/1000;return;}pose[key]=v;queueDraftSave();};
    }
    li.querySelector('.delete').onclick=()=>{poses.splice(index,1);renderPoses();};
    li.querySelector('.up').onclick=()=>{if(index){[poses[index-1],poses[index]]=[poses[index],poses[index-1]];renderPoses();}};
    li.querySelector('.down').onclick=()=>{if(index<poses.length-1){[poses[index+1],poses[index]]=[poses[index],poses[index+1]];renderPoses();}};
    const g=pose.grip||(pose.grip={action:'position',target:pose.p[5]??1500,settleMs:0});
    const action=li.querySelector('.gripAction'),pulse=li.querySelector('.gripPulse'),settle=li.querySelector('.gripSettle');
    action.value=g.action;pulse.value=g.target;settle.value=g.settleMs/1000;
    function gripFields(){pulse.disabled=['keep','release'].includes(g.action)||playing;settle.disabled=!['grab','open'].includes(g.action)||playing;}
    action.onchange=()=>{g.action=action.value;if(['grab','open'].includes(g.action)&&!g.settleMs)g.settleMs=300;settle.value=g.settleMs/1000;gripFields();queueDraftSave();};
    pulse.onchange=()=>{const v=Number(pulse.value);if(Number.isInteger(v)&&v>=810&&v<=1710)g.target=v;else pulse.value=g.target;queueDraftSave();};
    settle.onchange=()=>{const v=Math.round(Number(settle.value)*1000);if(Number.isInteger(v)&&v>=0&&v<=2000)g.settleMs=v;else settle.value=g.settleMs/1000;queueDraftSave();};
    gripFields();$('poses').append(li);
  });
  $('empty').hidden=poses.length>0;
  $('sequenceStatus').textContent=playing?t(`تشغيل الوضعية ${activePose+1} من ${poses.length}`):t(`${poses.length} وضعيات`);
  render();queueDraftSave();
}
function rejectPending(reason){
  for(const group of [pending,completed]){for(const item of group.values()){clearTimeout(item.timer);item.reject(Error(reason));}group.clear();}
}
function cancelPlayback(reason){
  playToken++;playing=false;activePose=-1;
  for(const item of completed.values()){clearTimeout(item.timer);item.reject(Error(reason));}completed.clear();
  renderPoses();
}
function fail(text){
  jog=0;protocol=false;state.armed=Array(AXES).fill(false);cancelPlayback(text);rejectPending(text);message(text);log(text);render();
  if(!closing) void disconnect(false);
}
function transmit(id,op,heartbeat=false){
  if(!linked||!writer) return;
  if(heartbeat&&pendingWrites) return;
  pendingWrites++;
  writeChain=writeChain.then(async()=>{if(linked&&writer) await writer.write(enc.encode(`${id} ${op}\n`));}).catch(()=>{if(!closing)fail(t('تعذّر الإرسال؛ توقفت الحركة.'));}).finally(()=>pendingWrites--);
}
function request(op){
  const id=nextId++;
  return new Promise((resolve,reject)=>{
    if(!linked||!writer){reject(Error(t('لا يوجد اتصال.')));return;}
    const timer=setTimeout(()=>{pending.delete(id);reject(Error(t('لم تؤكد اللوحة الأمر.')));},2200);
    pending.set(id,{resolve,reject,timer});transmit(id,op);
  });
}
function stopNow(text=t('توقفت الحركة'),keepGrip=false,soft=false){
  heldKeys.clear();jog=0;cancelPlayback(t('أُوقفت الحركة'));transmit(0,soft?'BRAKE':keepGrip?'STOPMOVE':'STOP');message(text);render();
}
function handleLine(line){
  if(line==='RAS20'){protocol=true;log('Robot Arm Studio v20 detected');return;}
  let limits=line.match(/^LIMITS20((?: \d+){12})$/);
  if(limits&&protocol){
    const v=limits[1].trim().split(/\s+/).map(Number);
    if(v.every((n,i)=>Number.isInteger(n)&&n>=(i<10?500:810)&&n<=(i<10?2500:1710)) &&
       Array.from({length:6},(_,c)=>v[c*2]<v[c*2+1]).every(Boolean) && v[10]===810&&v[11]===1710){
      for(let c=0;c<6;c++)LIMITS[c]=v.slice(c*2,c*2+2);
      if(typeof renderLimitSettings==='function')renderLimitSettings();
      render();
    }
    return;
  }
  let m=line.match(/^STATE20 (\d+) (\d+) (\d+) (\d+) (\d+) (\d+) ([01]) ([01]) ([01]) ([01]) ([01]) ([01]) ([01]) ([01]) ([01]) (\d+) ([01]) ([01]) ([01]) (\d+)$/);
  if(m&&protocol){
    const previous=state;
    state={p:m.slice(1,7).map(Number),armed:m.slice(7,13).map(v=>v==='1'),ready:m[13]==='1',moving:m[14]==='1',gripping:m[15]==='1',gripTarget:+m[16],gripHolding:m[17]==='1',holdMG90:m[18]==='1',gripRelaxed:m[19]==='1',outputs:Array.from({length:6},(_,c)=>(Number(m[20])&(1<<c))!==0)};
    if(state.p.some((v,i)=>v<LIMITS[i][0]||v>LIMITS[i][1])){fail(t('رد موضع خارج المجال المتوقع.'));return;}
    $('holdMG90').checked=state.holdMG90;
    lastState=performance.now();stateSeq++;
    if(playing&&!state.armed.every(Boolean))stopNow(t('أُلغي التشغيل: يلزم تفعيل المحركات الستة.'));
    if(jog&&!state.armed[selected])jog=0;
    if(jog&&((jog<0&&state.p[selected]<=LIMITS[selected][0])||(jog>0&&state.p[selected]>=LIMITS[selected][1])))stopNow(t('وصل إلى الحد المحدد؛ حسب وضع التثبيت.'),true);
    if(previous.ready&&!state.ready)stopNow(t('الدرايفر غير متاح؛ افحص التوصيلات.'));
    render();return;
  }
  m=line.match(/^STEP (\d+) (\d+)$/);if(m){activePose=Number(m[2]);renderPoses();return;}
  m=line.match(/^PLAN (\d+) (\d+)$/);
  if(m){const item=completed.get(+m[1]),duration=+m[2];if(item&&duration>=200&&duration<=25000000){clearTimeout(item.timer);item.timer=setTimeout(()=>{completed.delete(+m[1]);item.reject(Error(t('انتهت مهلة الحركة.')));},duration+4000);}return;}
  m=line.match(/^(ACK|DONE) (\d+)$/);
  if(m){const group=m[1]==='ACK'?pending:completed;const item=group.get(+m[2]);if(item){clearTimeout(item.timer);group.delete(+m[2]);item.resolve();}return;}
  m=line.match(/^ERR (\d+) (.+)$/);
  if(m){for(const group of [pending,completed]){const item=group.get(+m[1]);if(item){clearTimeout(item.timer);group.delete(+m[1]);item.reject(Error(m[2]));}}log(line);return;}
  if(line==='INFO GRIP_HOLDING'){message(state.holdMG90?t('أمر الإمساك جاهز؛ تثبيت الحمل مفعّل.'):t('أمر الإغلاق جاهز؛ وضع الراحة سيوقف النبضات.'));return;}
  if(line==='INFO GRIP_RELEASED'){message(t('تحررت الأصابع'));return;}
  if(line.startsWith('FAULT')){state.armed=Array(AXES).fill(false);stopNow(line==='FAULT RELEASE_FAILED'?t('تعذر إيقاف النبضات: افصل طاقة السيرفو.'):t('توقفت الحركة: ')+line);log(line);return;}
  if(line)log(line);
}
async function readLoop(){
  reader=port.readable.getReader();const decoder=new TextDecoder();let buffer='';
  try{while(linked){const {value,done}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});let end;while((end=buffer.indexOf('\n'))>=0){handleLine(buffer.slice(0,end).trim());buffer=buffer.slice(end+1);}if(buffer.length>4096)buffer='';}}
  catch(e){if(!closing)log('USB read: '+e.message);}
  finally{reader.releaseLock();reader=null;if(!closing&&linked)fail(t('انقطع USB. أعد الاتصال والتفعيل.'));}
}
async function connect(){
  if(BRIDGE)return connectBridge();
  if(!navigator.serial){message(t('افتح الملف في Chrome أو Edge على الحاسوب.'));return;}
  opening=true;render();
  try{
    port=await navigator.serial.requestPort();await port.open({baudRate:115200});
    writer=port.writable.getWriter();linked=true;protocol=false;state.ready=false;state.armed=Array(AXES).fill(false);
    nextId=1;pendingWrites=0;writeChain=Promise.resolve();lastState=performance.now();
    readTask=readLoop();
    // UART adapter control lines released. Never pulse reset while armed.
    try{await port.setSignals({dataTerminalReady:false,requestToSend:false});}catch{}
    message(t('ننتظر تعريف البرنامج v20…'));
    for(let i=0;i<12&&linked&&(!protocol||!stateSeqFresh());i++){transmit(0,'HELLO');await delay(250);}
    if(!protocol||!stateSeqFresh())throw Error(t('لا يصل STATE20. ارفع ملف RobotArmStudio.ino المرفق، واختر USB CDC Disabled.'));
    message(state.ready?t('متصل. اختر المحرك؛ أول تشغيل يحتاج تهيئة مسنودة.'):t('اللوحة متصلة لكن PCA9685 غير موجود.'));
  }catch(e){
    message(e.name==='NotFoundError'?t('لم يتم اختيار منفذ.'):e.message+t(' أغلق Serial Monitor عند الاتصال.'));
    await disconnect(false);
  }finally{opening=false;render();}
}
function stateSeqFresh(){return protocol&&performance.now()-lastState<500&&stateSeq>0;}
async function disconnect(notify=true){
  if(closing)return;closing=true;
  jog=0;cancelPlayback(t('فُصل الاتصال'));
  if(linked&&writer){transmit(0,'STOP');await Promise.race([writeChain,delay(250)]);}
  linked=false;protocol=false;state.armed=Array(AXES).fill(false);state.ready=false;rejectPending(t('فُصل الاتصال'));
  try{if(reader)await reader.cancel();if(readTask)await readTask;}catch{}
  try{if(writer){writer.releaseLock();writer=null;}if(port)await port.close();}catch{}
  if(bridgeSocket){bridgeSocket.close();bridgeSocket=null;}
  port=null;readTask=null;closing=false;stateSeq=0;
  if(notify)message(t('فُصل الاتصال. قد يبقى السيرفو ممسكًا بموضعه ما دامت الطاقة موصولة.'));render();
}
function delay(ms){return new Promise(r=>setTimeout(r,ms));}
async function freshStop(){const old=stateSeq;await request('STOPMOVE');for(let i=0;i<50;i++){if(stateSeq>old&&!state.moving)return;await delay(20);}throw Error(t('لم يصل تأكيد توقف الحركة.'));}
async function guarded(task){if(commanding)return;commanding=true;render();try{await task();}catch(e){message(e.message);}finally{commanding=false;render();}}
function startJog(d){if(!usable()||!state.armed[selected]||playing||commanding||(selected===5&&state.gripping))return;if(selected===5)gripIntent='position';heldKeys.clear();jog=d;transmit(0,`JOG ${selected} ${d} ${effectiveSpeed()}`);message(d>0?t('يتحرك باتجاه الزيادة'):t('يتحرك باتجاه النقصان'));render();}
function bindJog(id,d){const b=$(id);b.onpointerdown=e=>{if(e.button!==0)return;e.preventDefault();b.setPointerCapture(e.pointerId);startJog(d);};for(const ev of ['pointerup','pointercancel','lostpointercapture'])b.addEventListener(ev,()=>{if(jog===d)stopNow(t('يتباطأ المفصل برفق؛ حسب وضع التثبيت.'),true,true);});b.oncontextmenu=e=>e.preventDefault();}
bindJog('left',-1);bindJog('right',1);
$('connect').onclick=connect;$('disconnect').onclick=()=>disconnect();$('stop').onclick=()=>stopNow();
for(let i=0;i<AXES;i++)$('joint'+i).onclick=()=>{if(playing||commanding)return;stopNow(t('اختر المفصل وحرّكه؛ حسب وضع التثبيت.'),true);selected=i;numberAxis=i;speed=450;presetSpeed=speed;manualSpeed=false;renderSpeed();$('initPanel').hidden=true;$('initSupported').checked=false;render();};
function activateAll(){return guarded(async()=>{
  if(!usable())return;
  gripIntent='position';jog=0;message(t('تفعيل المحركات والانتقال إلى مواضع البدء المحددة…'));
  await runMotion('ARMALL',12000);$('initPanel').hidden=true;
  message(t('وضع الأساس'));
});}
$('armAll').onclick=activateAll;
$('arm').onclick=()=>guarded(async()=>{
  try{await request('ARM '+selected);$('initPanel').hidden=true;message(t('تم التفعيل مع الاحتفاظ بآخر موضع.'));}
  catch(e){if(e.message!=='NEED_INIT')throw e;
    showPage('settings');$('advancedSettings').open=true;document.querySelector('[data-settings-tab="hardware"]').click();$('initPanel').hidden=false;$('initSupported').checked=false;
    $('initPulse').min=LIMITS[selected][0];$('initPulse').max=LIMITS[selected][1];$('initPulse').value=state.p[selected];
    message(t('لم يتحرك المحرك. يلزم تهيئة أول تشغيل مع إسناد الذراع.'));
  }
});
try{const g=Number(localStorage.getItem('robot-grip-target'));if(Number.isInteger(g)&&g>=810&&g<=1710)$('gripTarget').value=g;}catch{}
function sendGrip(fast=false){return guarded(async()=>{
  const target=Number($('gripTarget').value);
  if(!Number.isInteger(target)||target<810||target>1710)throw Error(t('أدخل موضع الإغلاق الذي اختبرته بين 810 و1710.'));
  if(selected===5)jog=0;
  await request(`${fast?'GRIPFAST':'GRIP'} ${target}`);gripIntent='grab';
  try{localStorage.setItem('robot-grip-target',String(target));}catch{}
  message(fast?t('إغلاق سريع'):state.holdMG90?t('إمساك مستمر'):t('إغلاق؛ الراحة تلقائية'));
});}
$('grip').onclick=()=>sendGrip();
$('gripFast').onclick=()=>sendGrip(true);
function quickOpenTarget(){
  const close=Number($('gripTarget').value);
  const reference=Number.isInteger(close)&&close>=810&&close<=1710?close:1710;
  return reference>=1260?810:1710;
}
$('openFast').onclick=()=>guarded(async()=>{
  const target=quickOpenTarget();
  if(selected===5)jog=0;
  await request(`OPENFAST ${target}`);gripIntent='open';
  message(t('فتح سريع'));
});
$('releaseGrip').onclick=()=>guarded(async()=>{await request('RELEASE_GRIP');gripIntent='release';message(t('تحررت نبضات الأصابع. حرّكها باتجاه الفتح لإنزال الجسم.'));});
$('visualFlip').onchange=()=>{window.CartesianStudio?.setDirection(Number($('visualJoint').value),$('visualFlip').checked);visualSettings();};
$('initSupported').onchange=()=>render();
$('initialize').onclick=()=>guarded(async()=>{
  if(!$('initSupported').checked||!usable())return;
  const pulse=Number($('initPulse').value);
  if(!Number.isInteger(pulse)||pulse<LIMITS[selected][0]||pulse>LIMITS[selected][1])throw Error(t('موضع البداية خارج الحدود.'));
  await request(`INIT ${selected} ${pulse}`);$('initPanel').hidden=true;
  message(t('تمت التهيئة. الحركة التالية تتبع السرعة المختارة.'));
});
function renderSpeed(){
  $('manualSpeed').hidden=!manualSpeed;
  $('manualToggle').classList.toggle('selected',manualSpeed);
  $('manualToggle').setAttribute('aria-expanded',String(manualSpeed));
  $('manualToggle').setAttribute('aria-pressed',String(manualSpeed));
  $('speedValue').textContent=Math.round(effectiveSpeed()/SPEED_CAPS[selected]*100)+'%';
  $('speedSlider').max=SPEED_CAPS[selected];
  $('speedCap').textContent=SPEED_CAPS[selected]+' µs/s';
  $('speedSlider').value=effectiveSpeed();
  document.querySelectorAll('[data-speed]').forEach(b=>b.classList.toggle('selected',!manualSpeed&&+b.dataset.speed===presetSpeed));
}
document.querySelectorAll('[data-speed]').forEach(b=>b.onclick=()=>{
  manualSpeed=false;presetSpeed=+b.dataset.speed;speed=presetSpeed;renderSpeed();
});
$('manualToggle').onclick=()=>{
  manualSpeed=!manualSpeed;
  speed=manualSpeed?Number($('speedSlider').value):presetSpeed;
  renderSpeed();
};
$('speedSlider').oninput=()=>{
  const value=Number($('speedSlider').value);
  if(!manualSpeed||!Number.isFinite(value))return;
  speed=Math.max(50,Math.min(SPEED_CAPS[selected],Math.round(value/50)*50));
  renderSpeed();
};
renderSpeed();
window.addEventListener('blur',()=>{if(heldKeys.size||jog||playing||state.gripping)stopNow(t('توقفت حركة الذراع؛ حسب وضع التثبيت.'),true);});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&(heldKeys.size||jog||playing||state.gripping))stopNow(t('توقفت حركة الذراع؛ الإمساك مستمر ما دام الاتصال مستمرًا.'),true);});
window.addEventListener('pagehide',()=>{transmit(0,'STOP');});
setInterval(()=>{
  if(!linked||!protocol)return;
  if(performance.now()-lastState>900){if(playing||jog||state.armed.some(Boolean))stopNow(t('تأخر رد اللوحة؛ أعد التفعيل بعد استعادة الاتصال.'));state.armed=Array(AXES).fill(false);render();return;}
  if(heldKeys.size)sendKeys(true);else transmit(0,jog?`JOG ${selected} ${jog} ${effectiveSpeed()}`:'PING',true);
},100);
async function runMotion(op,timeoutMs){
  const id=nextId++;
  const done=new Promise((resolve,reject)=>{const timer=setTimeout(()=>{completed.delete(id);reject(Error(t('انتهت مهلة الحركة.')));},timeoutMs);completed.set(id,{resolve,reject,timer});});
  const acked=new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(id);reject(Error(t('لم تؤكد اللوحة الحركة.')));},2200);pending.set(id,{resolve,reject,timer});});
  transmit(id,op);await Promise.all([acked,done]);
}
async function movePair(p,ms,rate=1){
  if(!both())throw Error(t('فعّل المحركات الستة أولًا.'));
  const targets=p.map((v,i)=>v===null?state.p[i]:v);
  await runMotion(`MOVE ${targets.join(' ')} ${ms} ${Math.round(rate*1000)}`,ms+7000);
}
async function playSequence(list,rate=1,scalePauses=false,modeOverride=null){
  if(!both()||playing||commanding)return;
  heldKeys.clear();jog=0;playing=true;const token=++playToken;renderPoses();
  try{
    await freshStop();
    const mode=modeOverride||$('pathMode').value;
    await request(`SEQBEGIN ${list.length} ${Math.round(rate*1000)} ${mode==='steps'?0:1}`);
    let last=[...state.p];
    for(let i=0;i<list.length;i++){
      if(token!==playToken)throw Error(t('أُوقفت الحركة'));
      const p=list[i];last=p.p.map((v,ch)=>v===null?last[ch]:v);
      const duration=Math.max(200,Math.min(120000,Math.round(p.moveMs/rate)));
      const hold=mode==='flow'?0:Math.round(p.holdMs/(scalePauses?rate:1));
      const g=p.grip||{action:'position',target:last[5],settleMs:0};
      const action=['position','keep','grab','open','release'].indexOf(g.action);
      await request(`SEQADD ${last.join(' ')} ${duration} ${hold} ${action} ${g.target} ${g.settleMs}`);
    }
    if(token!==playToken)throw Error(t('أُوقفت الحركة'));
    message(t('تشغيل المسار'));await runMotion('SEQRUN',25000000);
    if(token===playToken){message(t('اكتملت الحركة'));return {ok:true};}
    return {ok:false,error:t('أُوقفت الحركة')};
  }catch(e){if(token===playToken){transmit(0,'STOP');message(e.message);}return {ok:false,error:e.message};}
  finally{if(token===playToken){playing=false;activePose=-1;renderPoses();}}
}
$('center').onclick=activateAll;
$('play').onclick=()=>{try{const clean=currentRoutine();playSequence(clean.poses,playbackRate,$('scalePauses').checked);}catch(e){message(e.message);}};
$('capture').onclick=()=>guarded(async()=>{if(!both())return;if(poses.length>=100)throw Error(t('الحد 100 وضعية.'));jog=0;await freshStop();if(!both())throw Error(t('أعد تفعيل المحركات الستة.'));poses.push({name:t(`وضعية ${poses.length+1}`),p:[...state.p],moveMs:1000,holdMs:0,grip:{action:state.gripping?'grab':gripIntent,target:state.gripping?(state.gripTarget||Number($('gripTarget').value)):state.p[5],settleMs:state.gripping||gripIntent==='open'?300:0}});renderPoses();message(t('أُضيفت الوضعية'));});
$('save').onclick=async()=>{try{const r=currentRoutine();if(!r.poses.length)throw Error(t('احفظ وضعية أولًا'));await motionDB.put(r);routines[r.name]=r;refreshSaved();renderLibrary();$('saved').value=r.name;message(t('حُفظت الحركة'));}catch(e){message(t('تعذّر الحفظ: ')+e.message);}};
$('load').onclick=()=>loadRoutine($('saved').value);
$('clear').onclick=()=>{if(poses.length&&!confirm(t('مسح قائمة الوضعيات الحالية؟')))return;poses=[];renderPoses();};
$('export').onclick=()=>{try{const r=currentRoutine();const url=URL.createObjectURL(new Blob([JSON.stringify(r,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='robot-motion.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);message(t('صُدّرت الحركة إلى ملف JSON.'));}catch(e){message(e.message);}};
$('import').onclick=()=>$('importFile').click();
$('importFile').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>200000)throw Error(t('الملف كبير جدًا.'));const clean=validateRoutine(JSON.parse(await file.text()));if(poses.length&&!confirm(t('استبدال قائمة الوضعيات الحالية؟')))return;poses=clean.poses;$('routineName').value=clean.name;renderPoses();message(t('استُوردت الحركة بدون تشغيلها. المفاصل غير المسجّلة تبقى ثابتة. اضغط حفظ للاحتفاظ بها.'));}catch(err){message(t('تعذّر الاستيراد: ')+err.message);}finally{e.target.value='';}};

