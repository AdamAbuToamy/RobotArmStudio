/* Exact STL viewer + explicit-confirmation XYZ control. All assets work offline.
   IK is a calibrated command model, never a measurement of actual position. */
(()=>{
'use strict';
window.STLStudioActive=true;
const K=window.ArmKinematics,M=window.ROBOT_STL,E=id=>document.getElementById(id);
if(!K||!M){window.STLStudioActive=false;return;}
let config=K.defaults(M),arm=K.create(M,config),current=[...K.HOME],target=[130,65,200],solution=null;
let gl=null,canvas=null,renderer=null,dirty=true,reference=false,calOverride=null,executing=false,previewRevision=0,initialized=false,executionAnchor=null;
let yaw=-2.3,pitch=.55,zoom=1,camera=null,ghost=null,pathPreview=[],lastFrame=0,lastPulseKey='';
const linkage=K.gripper(M);let fingerState=linkage(0);
function rebuildArm(){
 const close=Number(E('gripTarget')?.value)||1710;fingerState=linkage(K.gripFraction(current[5],close,config.directions?.[5],config.scales?.[5]??.5));
 const meshes=M.meshes.map(m=>{const t=fingerState.matrices[m.id];if(!t)return m;const points=[];for(const x of [m.bounds[0][0],m.bounds[1][0]])for(const y of [m.bounds[0][1],m.bounds[1][1]])for(const z of [m.bounds[0][2],m.bounds[1][2]])points.push(K.point(t,[x,y,z]));return {...m,bounds:[Array.from({length:3},(_,i)=>Math.min(...points.map(p=>p[i]))),Array.from({length:3},(_,i)=>Math.max(...points.map(p=>p[i])))]};});
 arm=K.create({...M,tool:fingerState.tool,meshes},config);
}
const axisNames=[t('القاعدة'),t('الكتف'),t('الكوع'),t('إمالة الرسغ'),t('دوران المقبض')];
const readCurrent=()=>live()?[...state.p]:[...current];
const verified=()=>K.configValid(config,M)&&config.pairs.every(p=>p.verified===true);
function notify(s){if(E('xyzStatus')){const concise=userMessage(s);E('xyzStatus').textContent=concise;E('xyzStatus').hidden=!concise;}}
function actualQ(){if(reference)return [0,0,0,0,0];const q=arm.angles(current);if(calOverride)q[calOverride.ch]=calOverride.q;return q;}
function wristOutputs(){return !!state.outputs?.[3]&&!!state.outputs?.[4];}
function live(){return typeof usable==='function'&&usable();}
function decode(text,Type){const b=atob(text),u=new Uint8Array(b.length);for(let i=0;i<b.length;i++)u[i]=b.charCodeAt(i);return new Type(u.buffer);}
function multiply(a,b){const r=new Float32Array(16);for(let c=0;c<4;c++)for(let row=0;row<4;row++)for(let k=0;k<4;k++)r[c*4+row]+=a[k*4+row]*b[c*4+k];return r;}
function shaderProgram(gl,vs,fs){
 function compile(type,s){const sh=gl.createShader(type);gl.shaderSource(sh,s);gl.compileShader(sh);if(!gl.getShaderParameter(sh,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(sh));return sh;}
 const p=gl.createProgram();gl.attachShader(p,compile(gl.VERTEX_SHADER,vs));gl.attachShader(p,compile(gl.FRAGMENT_SHADER,fs));gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p));return p;
}
// Feature lines are derived from the unmodified source triangles; no mesh is simplified.
function sketchEdges(positions,normals){
 const welded=new Map(),vertices=[],ids=new Uint32Array(positions.length/3);
 for(let v=0;v<ids.length;v++){const i=v*3,key=Math.round(positions[i]*1000)+','+Math.round(positions[i+1]*1000)+','+Math.round(positions[i+2]*1000);let id=welded.get(key);if(id===undefined){id=vertices.length;welded.set(key,id);vertices.push([positions[i],positions[i+1],positions[i+2]]);}ids[v]=id;}
 const edges=new Map();
 for(let v=0;v<ids.length;v+=3){const at=v*3,n=[normals[at],normals[at+1],normals[at+2]],len=Math.hypot(...n)||1;
  for(let k=0;k<3;k++){let a=ids[v+k],b=ids[v+(k+1)%3];if(a>b)[a,b]=[b,a];const key=a*1048576+b,edge=edges.get(key);
   if(!edge)edges.set(key,{a,b,n,len,count:1,crease:false});
   else{edge.count++;const dot=(edge.n[0]*n[0]+edge.n[1]*n[1]+edge.n[2]*n[2])/(edge.len*len);if(dot<.88)edge.crease=true;}
  }
 }
 const result=[];for(const e of edges.values())if(e.count===1||e.crease)result.push(...vertices[e.a],...vertices[e.b]);return new Float32Array(result);
}
function sketchWash(m){
 const colors=[[.83,.89,.74],[.91,.83,.70],[.79,.87,.90],[.85,.80,.90],[.78,.88,.82]];
 if(m.stage<0)return [.86,.90,.79];
 return colors[Math.min(m.stage,4)];
}
function createRenderer(gl){
 const meshProgram=shaderProgram(gl,`attribute vec3 a_position;attribute vec3 a_normal;uniform mat4 u_vp;uniform mat4 u_model;varying vec3 n;void main(){gl_Position=u_vp*u_model*vec4(a_position,1.0);n=mat3(u_model)*a_normal;}`,`precision mediump float;varying vec3 n;uniform vec4 u_color;void main(){vec3 v=normalize(n);float light=.90+.10*abs(dot(v,normalize(vec3(-.4,-.6,1.0))));float grain=fract(sin(dot(floor(gl_FragCoord.xy*.7),vec2(12.9898,78.233)))*43758.5453)-.5;float pencil=step(.93,fract((gl_FragCoord.x+gl_FragCoord.y*.65)*.13));gl_FragColor=vec4(u_color.rgb*light+grain*.014-pencil*.012,u_color.a);}`);
 const lineProgram=shaderProgram(gl,`attribute vec3 a_position;uniform mat4 u_vp;void main(){gl_Position=u_vp*vec4(a_position,1.0);gl_PointSize=8.0;}`,`precision mediump float;uniform vec4 u_color;uniform float u_point;void main(){if(u_point>.5&&distance(gl_PointCoord,vec2(.5))>.5)discard;gl_FragColor=u_color;}`);
 const loc={p:gl.getAttribLocation(meshProgram,'a_position'),n:gl.getAttribLocation(meshProgram,'a_normal'),vp:gl.getUniformLocation(meshProgram,'u_vp'),model:gl.getUniformLocation(meshProgram,'u_model'),color:gl.getUniformLocation(meshProgram,'u_color')};
 const ll={p:gl.getAttribLocation(lineProgram,'a_position'),vp:gl.getUniformLocation(lineProgram,'u_vp'),color:gl.getUniformLocation(lineProgram,'u_color'),point:gl.getUniformLocation(lineProgram,'u_point')};
 const meshes=M.meshes.map(m=>{const p=gl.createBuffer(),n=gl.createBuffer(),edge=gl.createBuffer(),positions=decode(m.positions,Float32Array),normals=decode(m.normals,Int8Array),ink=sketchEdges(positions,normals);gl.bindBuffer(gl.ARRAY_BUFFER,p);gl.bufferData(gl.ARRAY_BUFFER,positions,gl.STATIC_DRAW);gl.bindBuffer(gl.ARRAY_BUFFER,n);gl.bufferData(gl.ARRAY_BUFFER,normals,gl.STATIC_DRAW);gl.bindBuffer(gl.ARRAY_BUFFER,edge);gl.bufferData(gl.ARRAY_BUFFER,ink,gl.STATIC_DRAW);return {...m,p,n,edge,edgeCount:ink.length/3};});
 const dynamic=gl.createBuffer();gl.enable(gl.DEPTH_TEST);gl.disable(gl.CULL_FACE);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
 function lines(vertices,color,mode=gl.LINES){if(!vertices.length)return;gl.useProgram(lineProgram);gl.uniformMatrix4fv(ll.vp,false,camera.vp);gl.uniform4fv(ll.color,color);gl.uniform1f(ll.point,mode===gl.POINTS?1:0);gl.bindBuffer(gl.ARRAY_BUFFER,dynamic);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(vertices.flat()),gl.DYNAMIC_DRAW);gl.enableVertexAttribArray(ll.p);gl.vertexAttribPointer(ll.p,3,gl.FLOAT,false,0,0);if(loc.n!==ll.p)gl.disableVertexAttribArray(loc.n);gl.drawArrays(mode,0,vertices.length);}
 function model(q,isGhost=false){const f=(reference?K.create(M,config):arm).fk(q),fingers=reference?linkage(0):fingerState;gl.useProgram(meshProgram);gl.uniformMatrix4fv(loc.vp,false,camera.vp);gl.depthMask(!isGhost);gl.enable(gl.POLYGON_OFFSET_FILL);gl.polygonOffset(1,1);
  for(const m of meshes){let t=m.stage<0?K.I():f.matrices[m.stage];if(fingers.matrices[m.id])t=K.compose(t,fingers.matrices[m.id]);
   gl.uniformMatrix4fv(loc.model,false,K.toGL(t));gl.uniform4fv(loc.color,isGhost?[.63,.75,.51,.18]:[...sketchWash(m),1]);
   gl.bindBuffer(gl.ARRAY_BUFFER,m.p);gl.enableVertexAttribArray(loc.p);gl.vertexAttribPointer(loc.p,3,gl.FLOAT,false,0,0);
   gl.bindBuffer(gl.ARRAY_BUFFER,m.n);gl.enableVertexAttribArray(loc.n);gl.vertexAttribPointer(loc.n,3,gl.BYTE,true,0,0);gl.drawArrays(gl.TRIANGLES,0,m.count);
  }
  gl.disable(gl.POLYGON_OFFSET_FILL);
  if(!isGhost){gl.depthFunc(gl.LEQUAL);gl.disableVertexAttribArray(loc.n);gl.vertexAttrib3f(loc.n,0,0,1);gl.uniform4fv(loc.color,[.35,.43,.31,.72]);
   for(const m of meshes){let t=m.stage<0?K.I():f.matrices[m.stage];if(fingers.matrices[m.id])t=K.compose(t,fingers.matrices[m.id]);gl.uniformMatrix4fv(loc.model,false,K.toGL(t));gl.bindBuffer(gl.ARRAY_BUFFER,m.edge);gl.vertexAttribPointer(loc.p,3,gl.FLOAT,false,0,0);gl.drawArrays(gl.LINES,0,m.edgeCount);}gl.depthFunc(gl.LESS);
  }
  gl.depthMask(true);return f;
 }
 function updateCamera(){
  const rect=canvas.getBoundingClientRect(),w=rect.width||640,h=rect.height||500,dpr=Math.min(devicePixelRatio||1,2);
  if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);}
  const center=[0,0,240],eye=K.add(center,[1100*Math.cos(yaw)*Math.cos(pitch),1100*Math.sin(yaw)*Math.cos(pitch),1100*Math.sin(pitch)]),f=K.unit(K.sub(center,eye)),r=K.unit(K.cross(f,[0,0,1])),u=K.cross(r,f),aspect=w/h;
  const corners=[];for(const x of M.box.x)for(const y of M.box.y)for(const z of M.box.z)corners.push(K.sub([x,y,z],center));
  const hh=Math.max(...corners.map(p=>Math.abs(K.dot(p,u))*1.12),...corners.map(p=>Math.abs(K.dot(p,r))/aspect*1.12))/zoom,hw=hh*aspect;
  const view=new Float32Array([r[0],u[0],-f[0],0,r[1],u[1],-f[1],0,r[2],u[2],-f[2],0,-K.dot(r,eye),-K.dot(u,eye),K.dot(f,eye),1]);
  const near=1,far=3000,projection=new Float32Array([1/hw,0,0,0,0,1/hh,0,0,0,0,-2/(far-near),0,0,0,-(far+near)/(far-near),1]);
  camera={vp:multiply(projection,view),center,eye,f,r,u,hw,hh,w,h};gl.viewport(0,0,canvas.width,canvas.height);
 }
 function dashed(points,dash=15,gap=11){const out=[];for(let i=0;i<points.length;i+=2){const a=points[i],b=points[i+1],delta=K.sub(b,a),length=Math.hypot(...delta);if(!length)continue;for(let d=0;d<length;d+=dash+gap){out.push(K.add(a,K.mul(delta,d/length)),K.add(a,K.mul(delta,Math.min(d+dash,length)/length)));}}return out;}
 function workspace(){
  const edges=[];for(let a=0;a<3;a++){const other=[0,1,2].filter(x=>x!==a);for(const s of [0,1])for(const t of [0,1]){const p=[0,0,0],q=[0,0,0];other.forEach((v,i)=>{p[v]=q[v]=M.box[['x','y','z'][v]][i?s:t];});p[a]=M.box[['x','y','z'][a]][0];q[a]=M.box[['x','y','z'][a]][1];edges.push(p,q);}}
  lines(dashed(edges),[.55,.63,.45,.27]);
  const normal=['x','y','z'].indexOf(E('xyzPlane').value),others=[0,1,2].filter(v=>v!==normal),slice=target[normal],grid=[];
  for(let k=0;k<2;k++){const a=others[k],b=others[1-k],ra=M.box[['x','y','z'][a]],rb=M.box[['x','y','z'][b]];for(let n=ra[0];n<=ra[1];n+=100){let p=[0,0,0],q=[0,0,0];p[normal]=q[normal]=slice;p[a]=q[a]=n;p[b]=rb[0];q[b]=rb[1];grid.push(p,q);}}
  lines(dashed(grid,4,10),[.55,.63,.45,.16]);
  const colors=[[.69,.46,.29,.62],[.44,.57,.29,.62],[.35,.52,.61,.62]];
  for(let a=0;a<3;a++){const p=[0,0,0];p[a]=a===2?250:200;lines([[0,0,0],p],colors[a]);projectLabel('xyzAxis'+['X','Y','Z'][a],p);}
 }
 function draw(){updateCamera();gl.clearColor(.965,.964,.933,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);workspace();const f=model(actualQ());if(ghost&&!reference&&!calOverride){const g=arm.fk(ghost),bones=[];for(let i=1;i<g.nodes.length;i++)bones.push(g.nodes[i-1],g.nodes[i]);bones.push(g.nodes[4],g.tip);lines(bones,[.48,.64,.34,.52]);lines([...g.nodes,g.tip],[.48,.64,.34,.75],gl.POINTS);}
  lines(dashed([f.tip,target],6,7),solution?[.42,.58,.34,.48]:[.68,.49,.32,.40]);const cross=[];for(let a=0;a<3;a++){const p=[...target],q=[...target];p[a]-=8;q[a]+=8;cross.push(p,q);}lines(cross,solution?[.42,.59,.31,1]:[.68,.46,.28,1]);lines([target],solution?[.47,.64,.34,1]:[.68,.46,.28,1],gl.POINTS);lines([f.tip],[.38,.55,.63,1],gl.POINTS);
  if(pathPreview.length>1){let points=[];for(let i=1;i<pathPreview.length;i++)points.push(pathPreview[i-1],pathPreview[i]);lines(points,[.46,.61,.35,.7]);}
  E('xyzHud').textContent='TCP '+f.tip.map(v=>Math.round(v)).join(' / ')+' mm';
 }
 return {draw,meshes};
}
function projectLabel(id,p){if(!camera)return;const d=K.sub(p,camera.center),x=camera.w/2+K.dot(d,camera.r)/camera.hw*camera.w/2,y=camera.h/2-K.dot(d,camera.u)/camera.hh*camera.h/2;const e=E(id);e.style.left=K.clamp(x,5,camera.w-25)+'px';e.style.top=K.clamp(y,5,camera.h-25)+'px';}
function updateTargetInputs(){for(let i=0;i<3;i++)E('xyz'+['X','Y','Z'][i]).value=Math.round(target[i]);const axis=E('xyzPlane').value,k=['x','y','z'].indexOf(axis);E('xyzSlice').min=M.box[axis][0];E('xyzSlice').max=M.box[axis][1];E('xyzSlice').value=target[k];E('xyzSliceValue').textContent=axis.toUpperCase()+' '+Math.round(target[k])+' mm';}
function statusButtons(){if(!initialized)return;
 E('xyzCalCount').textContent=config.pairs.filter(p=>p.verified&&K.validPair(p)).length+' / 5';
 const targetValid=target.every(Number.isFinite)&&arm.inBox(target)&&target[2]>=config.floor;
 const enabled=live()&&typeof both==='function'&&both()&&!playing&&!commanding&&!executing&&verified()&&!!gl&&!!renderer&&state.holdMG90&&wristOutputs()&&(solution||targetValid)&&!reference&&!calOverride;
 E('xyzGo').disabled=!enabled;E('xyzHold').checked=!!state.holdMG90;E('xyzHold').disabled=!live()||playing||commanding||executing;
 for(let i=0;i<6;i++)E('xyzFlip'+i).disabled=playing||commanding||executing;
 if(E('visualFlip'))E('visualFlip').disabled=playing||commanding||executing;
 if(E('simRange'))E('simRange').disabled=playing||commanding||executing;
 E('xyzArm').disabled=!live()||playing||commanding||executing||!state.holdMG90;
 E('xyzCaptureA').disabled=E('xyzCaptureB').disabled=!live()||state.moving||executing;
 E('xyzSaveCalibration').disabled=playing||commanding||executing;
 for(const id of ['xyzPlane','xyzSlice','xyzX','xyzY','xyzZ','xyzPreview','xyzCalJoint','xyzCalAngle','xyzReference','xyzFollow','xyzAutoWrist'])E(id).disabled=playing||commanding||executing;
}
function preview(silent=false){
 if(!initialized||executing)return;reference=false;calOverride=null;current=readCurrent();rebuildArm();solution=arm.solve(target,current,LIMITS);if(!solution&&E('xyzAutoWrist').checked)solution=arm.solve(target,current,LIMITS,{wrist:true});ghost=solution?.q||null;pathPreview=[];dirty=true;statusButtons();previewRevision++;
 if(silent===true)return;
 if(!solution)notify(arm.inBox(target)?t('الفحص السريع لم يجد وضعية؛ اضغط OK للبحث الموسّع عن وضعية ومسار بديل.'):t('النقطة خارج صندوق العمل.'));
 else if(!verified())notify(t('المعاينة جاهزة. أكمل معايرة المحاور الخمسة لربط XYZ بالروبوت الحقيقي.'));
 else if(!live())notify(t('النقطة قابلة للوصول حسابيًا؛ اتصل بالروبوت وفعّل المحركات.'));
 else if(!state.holdMG90)notify(t('النقطة جاهزة. فعّل تثبيت الحمل للحفاظ على موضع الرسغ أثناء تنفيذ XYZ.'));
 else if(!wristOutputs())notify(t('اسند الذراع واضغط تفعيل وضع الأساس، أو حرّك الرسغين لتفعيل نبضاتهما قبل XYZ.'));
 else notify(t('النقطة قابلة للوصول حسابيًا. OK يخطط مسارًا ثم يرسل الحركة.'));
}
function pick(e){if(!camera||executing||playing||commanding)return;const r=canvas.getBoundingClientRect(),x=((e.clientX-r.left)/r.width*2-1)*camera.hw,y=(1-(e.clientY-r.top)/r.height*2)*camera.hh;
 const origin=K.add(camera.center,K.add(K.mul(camera.r,x),K.mul(camera.u,y))),normal=['x','y','z'].indexOf(E('xyzPlane').value);
 if(Math.abs(camera.f[normal])<.04){notify(t('هذا المستوى جانبي للكاميرا؛ غيّر المنظر أو مستوى الاختيار.'));return;}
 const t=(target[normal]-origin[normal])/camera.f[normal],p=K.add(origin,K.mul(camera.f,t));
 if(!arm.inBox(p)){notify(t('اختر نقطة داخل الصندوق.'));return;}target=p.map(Math.round);updateTargetInputs();preview();
}
function calFields(){
 E('xyzAutoWrist').checked=config.autoWrist!==false;
 for(let i=0;i<6;i++)E('xyzFlip'+i).checked=config.directions?.[i]===-1;
 if(typeof syncSimulationDirections==='function')syncSimulationDirections(config.directions);
 const body=E('xyzCalRows');body.replaceChildren();
 config.pairs.forEach((c,i)=>{const row=document.createElement('tr');const label=document.createElement('td');label.textContent=(i+1)+' · '+axisNames[i];row.append(label);
  for(const key of ['pA','aA','pB','aB']){const td=document.createElement('td'),input=document.createElement('input');input.type='number';input.step='1';input.id='xyzCal'+i+key;input.value=K.calibrationPair(c,i,config.directions?.[i],config.scales?.[i]??.5)[key]-(key==='aA'||key==='aB'?K.UPRIGHT[i]:0);input.setAttribute('aria-label',axisNames[i]+' '+key);input.oninput=()=>{E('xyzVerified'+i).checked=false;};td.append(input);row.append(td);}
  const td=document.createElement('td'),check=document.createElement('input');check.type='checkbox';check.id='xyzVerified'+i;check.checked=c.verified===true;check.setAttribute('aria-label',t('طابقت ')+axisNames[i]+t(' مع الواقع'));td.append(check);row.append(td);body.append(row);
 });
 config.toolOffset.forEach((v,i)=>E('xyzTool'+['X','Y','Z'][i]).value=v);statusButtons();
}
function collectCalibration(){const pairs=config.pairs.map((_,i)=>{const p={};for(const k of ['pA','aA','pB','aB'])p[k]=Number(E('xyzCal'+i+k).value)+(k==='aA'||k==='aB'?K.UPRIGHT[i]:0);p.verified=E('xyzVerified'+i).checked;return K.calibrationPair(p,i,config.directions?.[i],config.scales?.[i]??.5,true);});return {...config,pairs,toolOffset:['X','Y','Z'].map(k=>Number(E('xyzTool'+k).value))};}
function storeConfig(next){if(!K.configValid(next,M))throw Error(t('المعايرة تحتاج نقطتين بفارق ≥50 µs و≥10 درجات لكل محور، وإزاحة ضمن ±100 mm.'));config=structuredClone(next);rebuildArm();localStorage.setItem('robot-cartesian-v1',JSON.stringify(config));if(typeof persistSettings==='function')persistSettings();dirty=true;}
function capture(which){if(!live()||state.moving)return;const ch=Number(E('xyzCalJoint').value),q=actualQ()[ch];E('xyzCal'+ch+'p'+which).value=state.p[ch];E('xyzCal'+ch+'a'+which).value=q-K.UPRIGHT[ch];E('xyzVerified'+ch).checked=false;notify(t('سُجل الوضع ')+which+t('؛ سجّل الوضع الآخر ثم أكد مطابقة القيم واحفظ المعايرة.'));}
async function execute(){
 if(!verified()||!gl||!renderer||!live()||!both()||!state.holdMG90||!wristOutputs()||reference||calOverride||executing||playing||commanding||!target.every(Number.isFinite)||!arm.inBox(target)||target[2]<config.floor)return;
 const goal=[...target],rev=previewRevision,token=++playToken,allowWrist=E('xyzAutoWrist').checked;
 heldKeys.clear();jog=0;executing=true;playing=true;commanding=true;statusButtons();render();
 try{
  await freshStop();if(playToken!==token)throw Error(t('أُلغي التخطيط.'));
  E('xyzDiagnostic').hidden=true;const start=[...state.p];notify(t('أبحث عن وضعية ومسار؛ Esc للإلغاء.'));
  const route=await window.RobotPlanner.plan(arm,goal,start,LIMITS,{
   allowWrist,durationMs:K.clamp(Number(E('xyzDuration').value)||6,2,30)*1000,
   cancelled:()=>playToken!==token||rev!==previewRevision||!live(),
   progress:(stage,n)=>notify(stage==='goals'?t('أبحث عن وضعيات الوصول…'):stage==='roadmap'?t('أبني خريطة للحركات الوسيطة…'):stage==='astar'?t(`أبحث عن مسار عبر ${n} وضعية…`):t('أبحث عن طريق بديل…'))
  });
  if(!route.ok&&route.diagnostics){
   const d={version:39,...route.diagnostics,calibration:config};
   E('xyzDiagnosticText').textContent=JSON.stringify(d,null,2);E('xyzDiagnostic').hidden=false;
   if(route.reason==='goal'){
    const why={'mesh-floor':t('نموذج القطع يلامس الأرض حسابياً'),floor:t('فحص الأرض'),base:t('فحص الخلوص حول القاعدة'),box:t('حدود الصندوق')};
    const e=Number.isFinite(d.nearestError)?t(` أقرب محاولة تبعد ${d.nearestError.toFixed(1)} مم.`):'';
    throw Error(d.blocked?t(`وُجد حل قريب من الهدف لكن رفضه ${why[Object.entries(d.rejections||{}).sort((a,b)=>b[1]-a[1])[0]?.[0]]||'فحص الخلوص'}. افتح تشخيص الوصول.`):t(`لم تتقارب الحسابات لوضعية مقبولة.${e} افتح تشخيص الوصول وانسخ بياناته.`));
   }
  }
  if(!route.ok)throw Error(route.reason==='input'?t('الوضع الحالي أو الهدف خارج الخلوص الحسابي.'):route.reason==='goal'?t('لم يجد البحث وضعية تصل للهدف ضمن الحدود الحالية؛ جرّب نقطة قريبة أو السماح بإعادة توجيه الرسغ.'):t('لم يجد البحث مسارًا ضمن الحدود والخلوص الحاليين؛ قد يلزم تصحيح المعايرة أو تغيير الهدف.'));
  if(!live()||!both()||!state.holdMG90||!wristOutputs()||playToken!==token)throw Error(t('تغيّر التفعيل؛ أعد المعاينة.'));
  if(state.p.some((v,c)=>Math.abs(v-start[c])>1))throw Error(t('تغيّر وضع الروبوت أثناء التخطيط؛ أعد المحاولة.'));
  pathPreview=route.preview;ghost=arm.angles(route.points.at(-1));dirty=true;
  executionAnchor={finger:start[5],wrists:allowWrist?null:start.slice(3,5)};
  if(route.points.length===2){
   notify(t('تنفيذ انتقال متزامن واحد؛ Esc للإيقاف.'));
   await runMotion('MOVE '+route.points[1].join(' ')+' '+route.segmentMs+' 1000',route.segmentMs+7000);
  }else{
   const list=route.points.slice(1);notify(t('مسار عبر ')+(list.length-1)+t(' وضعيات وسيطة؛ Esc للإيقاف.'));
   await request('SEQBEGIN '+list.length+' 1000 '+(route.blend?1:0));
   for(const p of list){if(playToken!==token||!live())throw Error(t('أُوقف المسار.'));await request('SEQADD '+p.join(' ')+' '+route.segmentMs+' 0 1 '+start[5]+' 0');}
   if(playToken!==token||!live())throw Error(t('أُوقف المسار.'));
   await runMotion('SEQRUN',120000*list.length+7000);
  }
  if(playToken!==token)throw Error(t('أُوقفت الحركة.'));
  notify(t('انتهى المسار الحسابي؛ لا يوجد قياس يؤكد الموضع الحقيقي.'));
 }catch(e){notify(e.message==='CANCELLED'?t('أُلغي التخطيط.'):e.message==='SEARCH_LIMIT'?t('انتهت مهلة البحث؛ اختر نقطة أقرب أو وضعية بداية مختلفة.'):e.message);if(playToken===token&&live())transmit(0,'STOPMOVE');}
 finally{if(playToken===token){playing=false;activePose=-1;}commanding=false;executing=false;executionAnchor=null;dirty=true;render();statusButtons();}
}
function setScale(ch,value){
 if(!Number.isInteger(ch)||ch<0||ch>5||!Number.isFinite(value)||value<.1||value>2||playing||commanding||executing)return false;
 const scales=[...(config.scales||[.5,.5,.5,.5,.5,.5])];scales[ch]=value;
 storeConfig({...config,scales});calFields();preview();
 notify((axisNames[ch]||t('الأصابع'))+t(' · حجم الحركة ')+Math.round(value*100)+t('%؛ أوامر السيرفو لم تتغير.'));return true;
}
function setDirection(ch,reversed){
 if(!Number.isInteger(ch)||ch<0||ch>5||playing||commanding||executing)return false;
 const directions=[...(config.directions||[1,1,1,1,1,1])];directions[ch]=reversed?-1:1;
 storeConfig({...config,directions});calFields();preview();
 notify((axisNames[ch]||t('الأصابع'))+' · '+(reversed?t('معكوس'):t('عادي'))+t('؛ يظهر الفرق عند تحريك المفصل. وضع الأساس ثابت.'));
 return true;
}
function initialize(){
 initialized=true;canvas=E('stlCanvas');if(!canvas)return;
 for(let i=0;i<5;i++)E('xyzCalJoint').add(new Option((i+1)+' · '+axisNames[i],i));
 try{const c=JSON.parse(localStorage.getItem('robot-cartesian-v1')||'null');if(K.configValid(c,M)){config=K.migrate(c,M);localStorage.setItem('robot-cartesian-v1',JSON.stringify(config));arm=K.create(M,config);}}catch{}
 if(K.configValid(window.pendingCartesianConfig,M)){config=K.migrate(window.pendingCartesianConfig,M);localStorage.setItem('robot-cartesian-v1',JSON.stringify(config));arm=K.create(M,config);}
 for(let i=0;i<6;i++)E('xyzFlip'+i).onchange=()=>setDirection(i,E('xyzFlip'+i).checked);
 calFields();updateTargetInputs();
 try{gl=canvas.getContext('webgl',{antialias:true,alpha:false});if(!gl)throw Error(t('WebGL غير متاح'));renderer=createRenderer(gl);E('xyzModelStatus').textContent=window.ROBOT_MODEL_KIND==='schematic'?t('نموذج توضيحي · ليس هندسة STL الأصلية'):t('STL · قياسات المفاصل مطبّقة');}
 catch(e){E('xyzModelStatus').textContent=t('تعذر عرض STL: ')+e.message;notify(t('جرّب Chrome أو Edge مع تفعيل تسريع الرسومات.'));return;}
 const pointers=new Map();let start=null,dragged=false;
 canvas.addEventListener('pointerdown',e=>{canvas.setPointerCapture(e.pointerId);pointers.set(e.pointerId,[e.clientX,e.clientY]);start=[e.clientX,e.clientY];dragged=false;});
 canvas.addEventListener('pointermove',e=>{if(!pointers.has(e.pointerId))return;const old=pointers.get(e.pointerId);pointers.set(e.pointerId,[e.clientX,e.clientY]);if(Math.hypot(e.clientX-start[0],e.clientY-start[1])>5)dragged=true;
  if(pointers.size===1&&dragged){yaw-=(e.clientX-old[0])*.008;pitch=K.clamp(pitch+(e.clientY-old[1])*.006,.04,1.53);dirty=true;}
  else if(pointers.size===2){dragged=true;const other=[...pointers].find(([id])=>id!==e.pointerId)?.[1];if(other){const before=Math.hypot(old[0]-other[0],old[1]-other[1]),after=Math.hypot(e.clientX-other[0],e.clientY-other[1]);if(before)zoom=K.clamp(zoom*after/before,.5,3);dirty=true;}}
 });
 canvas.addEventListener('pointerup',e=>{if(pointers.size===1&&!dragged)pick(e);pointers.delete(e.pointerId);});for(const ev of ['pointercancel','lostpointercapture'])canvas.addEventListener(ev,e=>pointers.delete(e.pointerId));
 canvas.addEventListener('wheel',e=>{e.preventDefault();zoom=K.clamp(zoom*Math.exp(-e.deltaY*.001),.5,3);dirty=true;},{passive:false});
 for(const [id,y,p] of [['xyzFront',-Math.PI/2,.15],['xyzSide',0,.15],['xyzTop',-Math.PI/2,1.5],['xyzReset',-2.3,.55]])E(id).onclick=()=>{yaw=y;pitch=p;zoom=1;dirty=true;};
 E('xyzPlane').onchange=()=>{updateTargetInputs();dirty=true;};E('xyzSlice').oninput=()=>{const k=['x','y','z'].indexOf(E('xyzPlane').value);target[k]=Number(E('xyzSlice').value);updateTargetInputs();preview();};
 for(let i=0;i<3;i++)E('xyz'+['X','Y','Z'][i]).onchange=()=>{target[i]=Number(E('xyz'+['X','Y','Z'][i]).value);updateTargetInputs();preview();};
 E('xyzArm').onclick=async()=>{await activateAll();preview();};
 E('xyzAutoWrist').onchange=()=>{storeConfig({...config,autoWrist:E('xyzAutoWrist').checked});preview();};E('xyzPreview').onclick=preview;E('xyzGo').onclick=execute;E('xyzStop').onclick=()=>stopNow(t('توقفت الحركة'));
 E('xyzHold').onchange=()=>{E('holdMG90').checked=E('xyzHold').checked;E('holdMG90').onchange();};
 E('xyzCalAngle').oninput=()=>{reference=false;const ch=Number(E('xyzCalJoint').value),q=K.UPRIGHT[ch]+Number(E('xyzCalAngle').value);calOverride={ch,q};E('xyzCalAngleValue').textContent=(q-K.UPRIGHT[ch])+'°';ghost=null;dirty=true;statusButtons();};
 E('xyzCalJoint').onchange=()=>{const ch=Number(E('xyzCalJoint').value);calOverride=null;E('xyzCalAngle').value=Math.round(actualQ()[ch]-K.UPRIGHT[ch]);E('xyzCalAngleValue').textContent=E('xyzCalAngle').value+'°';if(!playing&&!commanding&&!executing)E('joint'+ch).click();dirty=true;};
 E('xyzCalibration').addEventListener('toggle',()=>{if(E('xyzCalibration').open&&!playing&&!commanding&&!executing)E('xyzCalJoint').onchange();});
 E('xyzCaptureA').onclick=()=>capture('A');E('xyzCaptureB').onclick=()=>capture('B');
 E('xyzReference').onclick=()=>{reference=true;calOverride=null;ghost=null;dirty=true;statusButtons();notify(t('هذه وضعية ملف STL الأصلية؛ جميع الزوايا النسبية صفر.'));};
 E('xyzFollow').onclick=()=>{reference=false;calOverride=null;dirty=true;preview();};
 E('xyzSaveCalibration').onclick=()=>{try{storeConfig(collectCalibration());calOverride=null;reference=false;calFields();preview();notify(t('حُفظت المعايرة دون حركة. ')+config.pairs.filter(p=>p.verified).length+t(' / 5 محاور مؤكدة.'));}catch(e){notify(e.message);}};
 window.addEventListener('resize',()=>dirty=true);
 canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();gl=null;if(linked)stopNow(t('توقف عرض STL؛ أُوقفت الحركة.'));E('xyzModelStatus').textContent=t('توقف عرض STL');notify(t('أعد فتح الصفحة لاستعادة عرض STL.'));statusButtons();});
 function animate(now){requestAnimationFrame(animate);if(!gl||!renderer)return;if(now-lastFrame<40||document.hidden)return;lastFrame=now;if(!dirty||E('page-simulation').hidden)return;dirty=false;renderer.draw();}
 requestAnimationFrame(animate);current=readCurrent();preview(true);
 // Compile/upload the first frame before USB control can start, not during a live move.
 const panel=E('page-simulation'),hidden=panel.hidden,oldStyle=panel.getAttribute('style');
 if(hidden){const main=document.querySelector('main'),style=getComputedStyle(main),width=main.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight);panel.hidden=false;panel.style.cssText='position:fixed;left:-20000px;top:0;width:'+width+'px;visibility:hidden';}
 renderer.draw();gl.finish();
 if(hidden){panel.hidden=true;if(oldStyle===null)panel.removeAttribute('style');else panel.setAttribute('style',oldStyle);}
 dirty=false;
}
window.CartesianStudio={
 refreshLanguage(){axisNames.splice(0,axisNames.length,...I18n.axisNames().slice(0,5));
  [...E('xyzCalJoint').options].forEach((o,i)=>o.textContent=axisNames[i]);
  for(let i=0;i<5;i++){
   const row=E('xyzCalRows').children[i];if(row)row.firstChild.textContent=(i+1)+' · '+axisNames[i];
   for(const key of ['pA','aA','pB','aB']){const e=E('xyzCal'+i+key);if(e)e.setAttribute('aria-label',axisNames[i]+' '+key);}
   E('xyzVerified'+i)?.setAttribute('aria-label',t('طابقت ')+axisNames[i]+t(' مع الواقع'));
  }
 },
 setDirection,setScale,
 snapshot(){return structuredClone(config);},
 configure(c){if(executing||playing||commanding)return;if(K.configValid(c,M)){config=K.migrate(c,M);localStorage.setItem('robot-cartesian-v1',JSON.stringify(config));rebuildArm();if(initialized){calFields();preview(true);}dirty=true;}},
 onState(s){if(executing&&playing&&(!s.holdMG90||!s.outputs?.[3]||!s.outputs?.[4]))stopNow(t('توقف XYZ: فُقد تثبيت الرسغ.'));if(executing&&playing&&executionAnchor&&(Math.abs(s.p[5]-executionAnchor.finger)>1||(executionAnchor.wrists&&s.p.slice(3,5).some((v,i)=>Math.abs(v-executionAnchor.wrists[i])>1))))stopNow(t('توقف XYZ: تغيّرت وضعية الرسغ أو القبضة.'),true);const key=s.p.join(',')+'|'+E('gripTarget')?.value;if(live()&&key!==lastPulseKey){lastPulseKey=key;current=[...s.p];rebuildArm();if(initialized&&!reference&&!calOverride){const ch=Number(E('xyzCalJoint').value);E('xyzCalAngle').value=Math.round(actualQ()[ch]-K.UPRIGHT[ch]);E('xyzCalAngleValue').textContent=E('xyzCalAngle').value+'°';}dirty=true;}statusButtons();},
 resize(){dirty=true;},
 getState(){return {target:[...target],solution:solution?structuredClone(solution):null,verified:verified(),config:structuredClone(config),q:actualQ(),tip:arm.fk(actualQ()).tip,executing,modelHash:M.sha256,meshCount:M.meshCount,triangles:M.triangles,webgl:!!gl};},
 select(p){if(!Array.isArray(p)||p.length!==3)return;target=[...p];updateTargetInputs();preview();},
 project(p){if(!camera)return null;const d=K.sub(p,camera.center);return [camera.w/2+K.dot(d,camera.r)/camera.hw*camera.w/2,camera.h/2-K.dot(d,camera.u)/camera.hh*camera.h/2];}
};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initialize);else initialize();
})();
