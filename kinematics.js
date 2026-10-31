/* Millimetres, Z-up; product-of-exponentials joints measured from source CAD.
   Pure math module: usable in Node tests and the offline browser. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ArmKinematics=api;})(typeof globalThis!=='undefined'?globalThis:this,()=>{
 const add=(a,b)=>a.map((v,i)=>v+b[i]),sub=(a,b)=>a.map((v,i)=>v-b[i]),mul=(a,s)=>a.map(v=>v*s),dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),norm=a=>Math.hypot(...a),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],unit=a=>mul(a,1/(norm(a)||1)),clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
 const I=()=>({r:[1,0,0,0,1,0,0,0,1],t:[0,0,0]}),vector=(m,p)=>[0,1,2].map(i=>m.r[i*3]*p[0]+m.r[i*3+1]*p[1]+m.r[i*3+2]*p[2]),point=(m,p)=>add(vector(m,p),m.t);
 function compose(a,b){return {r:Array.from({length:9},(_,n)=>{let i=Math.floor(n/3),j=n%3;return a.r[i*3]*b.r[j]+a.r[i*3+1]*b.r[j+3]+a.r[i*3+2]*b.r[j+6];}),t:point(a,b.t)};}
 function rotate(origin,axis,degrees){const [x,y,z]=unit(axis),a=degrees*Math.PI/180,c=Math.cos(a),s=Math.sin(a),d=1-c;let m={r:[c+x*x*d,x*y*d-z*s,x*z*d+y*s,y*x*d+z*s,c+y*y*d,y*z*d-x*s,z*x*d-y*s,z*y*d+x*s,c+z*z*d],t:[0,0,0]};m.t=sub(origin,vector(m,origin));return m;}
 const toGL=m=>new Float32Array([m.r[0],m.r[3],m.r[6],0,m.r[1],m.r[4],m.r[7],0,m.r[2],m.r[5],m.r[8],0,...m.t,1]);
 function validPair(c){return c&&['pA','pB','aA','aB'].every(k=>Number.isFinite(c[k]))&&c.pA>=500&&c.pA<=2500&&c.pB>=500&&c.pB<=2500&&Math.abs(c.pA-c.pB)>=50&&Math.abs(c.aA-c.aB)>=10&&Math.abs(c.aA)<=360&&Math.abs(c.aB)<=360&&Math.abs((c.aA-c.aB)/(c.pA-c.pB))<=1;}
 // STL was exported folded. Physical activation pose is upright.
 const HOME=[1100,1030,1650,1640,1400,1480];
 const UPRIGHT=[0,-4.188359209615607,77.81706040596643,0,93.48557167110837];
 function defaults(model){let home=HOME.slice(0,5),sign=[-1,1,-1,1,1];return applyMeasurements({model:model.sha256,reference:'home-photo-v2',directions:[1,1,1,1,1,1],scales:[.5,.5,.5,.5,.5,.5],pairs:home.map((p,i)=>({pA:p,aA:UPRIGHT[i],pB:p+350,aB:UPRIGHT[i]+45*sign[i],verified:false})),toolOffset:[0,0,0],floor:15});}
 function migrate(config,model){
  if(!configValid(config,model))return defaults(model);
  const next=JSON.parse(JSON.stringify(config));if(!next.directions)next.directions=[1,1,1,1,1,1];if(!next.scales)next.scales=[.5,.5,.5,.5,.5,.5];if(next.reference==='home-photo-v2')return applyMeasurements(next);
  const fresh=defaults(model);
  // A saved calibration could previously override the user's known home pose.
  // Rebase the same pulse/angle slopes onto the physical home anchor; no servo commands.
  next.previousCalibration={reference:config.reference||'legacy-stl',pairs:JSON.parse(JSON.stringify(config.pairs))};
  next.pairs=next.pairs.map((p,i)=>{const delta=UPRIGHT[i]-angle(HOME[i],p),moved={...p,aA:p.aA+delta,aB:p.aB+delta,verified:p.verified===true};return validPair(moved)?moved:fresh.pairs[i];});
  next.reference='home-photo-v2';return applyMeasurements(next);
 }
 const MEASURED_REVISION='user-20261017-v1';
 const MEASURED={1:{pA:2000,aA:90,pB:590,aB:-45},2:{pA:650,aA:90,pB:2280,aB:-45},4:{pA:2390,aA:90,pB:850,aB:-45}};
 function applyMeasurements(c){
  if(c.measurementRevision===MEASURED_REVISION)return c;
  c.measurementBackup={pairs:JSON.parse(JSON.stringify(c.pairs)),scales:[...c.scales],directions:[...c.directions]};
  for(const [key,m] of Object.entries(MEASURED)){
   const ch=Number(key),p={...m,aA:m.aA+UPRIGHT[ch],aB:m.aB+UPRIGHT[ch],verified:true};
   // Store the inverse of the user's direction setting so reported signed measurements
   // are reproduced exactly, while the existing checkbox choice remains available.
   c.pairs[ch]=calibrationPair(p,ch,c.directions[ch],1,true);c.scales[ch]=1;
  }
  // Wrist input supplies a 90-degree span, not an absolute CAD orientation.
  // Preserve the known activation orientation and the selected effective direction.
  const old=c.pairs[3],sign=Math.sign((old.aB-old.aA)/(old.pB-old.pA))*(c.directions[3]||1)||1;
  const slope=sign*90/(1635-595);
  const wrist={pA:1635,aA:UPRIGHT[3]+slope*(1635-HOME[3]),pB:595,aB:UPRIGHT[3]+slope*(595-HOME[3]),verified:old.verified===true};
  c.pairs[3]=calibrationPair(wrist,3,c.directions[3],1,true);c.scales[3]=1;
  c.measurementRevision=MEASURED_REVISION;c.measurements={axes:JSON.parse(JSON.stringify(MEASURED)),wrist:{pA:1635,pB:595,spanDegrees:90,absoluteOrientationMeasured:false}};
  return c;
 }
 function calibrationPair(p,ch,direction=1,scale=1,inverse=false){
  const home=angle(HOME[ch],p),sign=(direction===-1?-1:1)*(inverse?1/scale:scale);
  return {...p,aA:home+sign*(p.aA-home),aB:home+sign*(p.aB-home)};
 }
 function gripFraction(p,closed,direction=1,scale=1){
  if(!Number.isFinite(closed)||closed<810||closed>1710)closed=1710;
  // The photo confirms the open linkage at the known 1480-us home command.
  // Other finger positions remain a visual estimate, with no force/position feedback.
  let end=Math.abs(closed-HOME[5])>=50?closed:(closed<HOME[5]?810:1710);
  if(direction===-1)end=end<HOME[5]?1710:810;
  return clamp((p-HOME[5])/(end-HOME[5])*scale,0,1);
 }
 function configValid(config,model){return config&&(!config.scales||(Array.isArray(config.scales)&&config.scales.length===6&&config.scales.every(v=>Number.isFinite(v)&&v>=.1&&v<=2)))&&(!config.directions||(Array.isArray(config.directions)&&config.directions.length===6&&config.directions.every(v=>v===1||v===-1)))&&config.model===model.sha256&&Array.isArray(config.pairs)&&config.pairs.length===5&&config.pairs.every(validPair)&&Array.isArray(config.toolOffset)&&config.toolOffset.length===3&&config.toolOffset.every(x=>Number.isFinite(x)&&Math.abs(x)<=100)&&Number.isFinite(config.floor)&&config.floor>=5&&config.floor<=100;}
 const angle=(pulse,c)=>c.aA+(pulse-c.pA)*(c.aB-c.aA)/(c.pB-c.pA),pulse=(q,c)=>c.pA+(q-c.aA)*(c.pB-c.pA)/(c.aB-c.aA);
 function gripper(model){
  if(!model.fingers)return ()=>({matrices:{},tool:model.tool});
  const n=unit(model.fingers.axis),middle=mul(add(model.fingers.sides[0].tip,model.fingers.sides[1].tip),.5);
  const prepare=s=>{const project=p=>sub(p,mul(n,dot(sub(p,s.A),n)));return {...s,B:project(s.B),C:project(s.C),D:project(s.D)};};
  const sides=model.fingers.sides.map(prepare);
  const signed=(a,b)=>Math.atan2(dot(n,cross(a,b)),dot(a,b))*180/Math.PI;
  function side(s,deg){
   const gear=rotate(s.A,n,deg),C=point(gear,s.C),d=norm(sub(C,s.B)),r=norm(sub(s.D,s.B)),l=norm(sub(s.D,s.C));if(d<1e-8)return null;
   const x=(r*r-l*l+d*d)/(2*d),h2=r*r-x*x;if(h2<-.001)return null;
   const u=unit(sub(C,s.B)),v=unit(cross(n,u)),base=add(s.B,mul(u,x)),h=Math.sqrt(Math.max(0,h2)),a=add(base,mul(v,h)),b=sub(base,mul(v,h));
   const D=norm(sub(a,s.D))<norm(sub(b,s.D))?a:b;
   const bar=rotate(s.B,n,signed(sub(s.D,s.B),sub(D,s.B))),phi=signed(sub(s.D,s.C),sub(D,C));
   const finger=rotate(s.C,n,phi);finger.t=add(finger.t,sub(C,s.C));
   return {gear,bar,finger,tip:point(finger,s.tip)};
  }
  const signs=sides.map(s=>{const a=side(s,1),b=side(s,-1);return a&&b?(dot(sub(a.tip,s.tip),sub(middle,s.tip))>dot(sub(b.tip,s.tip),sub(middle,s.tip))?1:-1):1;});
  let close=0,best=norm(sub(sides[0].tip,sides[1].tip));
  for(let a=1;a<=60;a++){const p=side(sides[0],a*signs[0]),q=side(sides[1],a*signs[1]);if(!p||!q)break;const d=norm(sub(p.tip,q.tip));if(d<best){best=d;close=a;}if(d<9)break;}
  return f=>{let result={matrices:{},tool:model.tool},tips=[];
   sides.forEach((s,i)=>{const p=side(s,clamp(f,0,1)*close*signs[i]);if(!p)return;[p.gear,p.bar,p.finger].forEach((m,j)=>result.matrices[s.ids[j]]=m);tips.push(p.tip);});
   if(tips.length===2)result.tool=mul(add(tips[0],tips[1]),.5);return result;
  };
 }

 function smoothPath(points,samples=12){
  const tangent=(i,c)=>{if(i<=0||i>=points.length-1)return 0;const a=points[i][c]-points[i-1][c],b=points[i+1][c]-points[i][c];if(a*b<=0)return 0;return clamp(2*a*b/(a+b),-1.25*Math.min(Math.abs(a),Math.abs(b)),1.25*Math.min(Math.abs(a),Math.abs(b)));};
  const out=[];for(let i=1;i<points.length;i++){
   const controls=points[i].map((q,c)=>{const p=points[i-1][c],u=tangent(i-1,c)/5,v=tangent(i,c)/5;return [p,p+u,p+2*u,q-2*v,q-v,q];});
   for(let n=0;n<=samples;n++){const t=n/samples;out.push(controls.map(b=>{const w=[...b];for(let d=5;d>0;d--)for(let k=0;k<d;k++)w[k]+=(w[k+1]-w[k])*t;return w[0];}));}
  }return out;
 }
 function create(model,config){
  const direction=i=>config.directions?.[i]===-1?-1:1,scale=i=>config.scales?.[i]??.5;
  function modelAngle(p,i){const c=config.pairs[i],home=angle(HOME[i],c);return home+direction(i)*scale(i)*(angle(p,c)-home);}
  function angles(p){return config.pairs.map((c,i)=>modelAngle(p[i],i));}
  function pulses(q,p){return [...q.map((a,i)=>{const c=config.pairs[i],home=angle(HOME[i],c);return Math.round(pulse(home+direction(i)*(a-home)/scale(i),c));}),p[5]];}
  function fk(q){let m=I(),matrices=[],nodes=[];for(let i=0;i<5;i++){nodes.push(point(m,model.joints[i].origin));m=compose(m,rotate(model.joints[i].origin,model.joints[i].axis,q[i]));matrices.push(m);}return {matrices,nodes,tip:point(m,add(model.tool,config.toolOffset))};}
  function qBounds(limits){return config.pairs.map((c,i)=>[modelAngle(limits[i][0],i),modelAngle(limits[i][1],i)].sort((a,b)=>a-b));}
  function inBox(p){return ['x','y','z'].every((k,i)=>p[i]>=model.box[k][0]&&p[i]<=model.box[k][1]);}
  function clearanceIssue(q){
   const f=fk(q);if(!inBox(f.tip))return 'box';if(f.tip[2]<config.floor)return 'floor';
   // The rotated per-part AABBs conservatively contain the original STL surfaces.
   for(const m of model.meshes||[]){
    if(m.stage<1||!m.bounds)continue;const t=f.matrices[m.stage];
    for(const x of [m.bounds[0][0],m.bounds[1][0]])for(const y of [m.bounds[0][1],m.bounds[1][1]])for(const z of [m.bounds[0][2],m.bounds[1][2]])if(point(t,[x,y,z])[2]<3)return 'mesh-floor';
   }
   const nodes=[...f.nodes.slice(1),f.tip];
   for(let k=0;k<nodes.length-1;k++)for(let n=0;n<=10;n++){
    const p=add(nodes[k],mul(sub(nodes[k+1],nodes[k]),n/10));
    if(p[2]<config.floor)return 'floor';
    // Conservative shaft clearance; not full mesh collision detection.
    if(p[2]<85&&Math.hypot(p[0],p[1])<63)return 'base';
   }
   return null;
  }
  function clearance(q){return clearanceIssue(q)===null;}
  function solve3(a,b){ // Pivoted Gaussian elimination of a 3x3 system.
   const m=a.map((r,i)=>[...r,b[i]]);
   for(let k=0;k<3;k++){let j=k;for(let i=k+1;i<3;i++)if(Math.abs(m[i][k])>Math.abs(m[j][k]))j=i;[m[k],m[j]]=[m[j],m[k]];if(Math.abs(m[k][k])<1e-12)return [0,0,0];const d=m[k][k];for(let t=k;t<4;t++)m[k][t]/=d;for(let i=0;i<3;i++)if(i!==k){const f=m[i][k];for(let t=k;t<4;t++)m[i][t]-=f*m[k][t];}}
   return m.map(r=>r[3]);
  }
  function solve(target,start,limits,options={}){
   if(!target.every(Number.isFinite)||!inBox(target)||target[2]<config.floor)return null;
   const bounds=qBounds(limits),base=angles(start),active=options.wrist?[0,1,2,3,4]:[0,1,2];
   const seeds=[base];if(options.multi!==false)for(const offsets of [[0,30,-60],[0,-30,60],[90,0,0],[-90,0,0],[0,60,30],[0,-60,-30],[170,30,-60],[-170,-30,60]]){const q=[...base];active.forEach((c,j)=>q[c]=clamp(q[c]+(offsets[j]||0),...bounds[c]));seeds.push(q);}
   // Exact bounded coordinate minimization escapes LM stalls at saturated joints.
   function ccd(q){
    let current=[...q];
    for(let pass=0;pass<2;pass++)for(const ch of [...active].reverse()){
     const f=fk(current),origin=f.nodes[ch],axis=unit(ch?vector(f.matrices[ch-1],model.joints[ch].axis):model.joints[ch].axis);
     const from=sub(f.tip,origin),to=sub(target,origin),u=sub(from,mul(axis,dot(from,axis))),v=sub(to,mul(axis,dot(to,axis)));
     const delta=Math.atan2(dot(axis,cross(u,v)),dot(u,v))*180/Math.PI;
     let next=current,bestError=norm(sub(target,f.tip));
     for(const wrap of [-360,0,360]){const t=[...current];t[ch]=clamp(current[ch]+delta+wrap,...bounds[ch]);const e=norm(sub(target,fk(t).tip));if(e<bestError-1e-9){bestError=e;next=t;}}
     current=next;
    }
    return current;
   }
   let best=null;
   for(const seed of seeds){let q=[...seed],damping=.55;
    for(let iter=0;iter<100;iter++){
     const p=fk(q).tip,e=sub(target,p),err=norm(e);if(err<.35)break;
     const jac=active.map(ch=>{const t=[...q];t[ch]+=.15;return mul(sub(fk(t).tip,p),1/.15);});
     const a=Array.from({length:3},(_,i)=>Array.from({length:3},(_,j)=>jac.reduce((s,c)=>s+c[i]*c[j],0)+(i===j?damping*damping:0)));
     const v=solve3(a,e);let step=jac.map(c=>dot(c,v));const largest=Math.max(...step.map(Math.abs),1);if(largest>9)step=step.map(v=>v*9/largest);
     let candidate=[...q];active.forEach((ch,j)=>candidate[ch]=clamp(q[ch]+step[j],...bounds[ch]));
     if(norm(sub(target,fk(candidate).tip))>=err){const fallback=ccd(q);if(norm(sub(target,fk(fallback).tip))<err-1e-7){q=fallback;damping=.55;}else{damping=Math.min(30,damping*1.6);if(damping>=30)break;}}else{q=candidate;damping=Math.max(.15,damping*.8);}
    }
    const p=pulses(q,start);if(p.some((v,i)=>v<limits[i][0]||v>limits[i][1]))continue;
    const rounded=angles(p),tip=fk(rounded).tip,error=norm(sub(target,tip)),issue=clearanceIssue(rounded);
    if(options.report){const r=options.report;r.attempts=(r.attempts||0)+1;if(!Number.isFinite(r.nearestError)||error<r.nearestError){r.nearestError=error;r.nearestTip=tip;r.nearestP=p;r.nearestIssue=issue;}if(error<=2&&issue){r.blocked=(r.blocked||0)+1;r.rejections=r.rejections||{};r.rejections[issue]=(r.rejections[issue]||0)+1;}}
    if(error>2||issue)continue;
    const cost=rounded.reduce((sum,v,i)=>sum+(v-base[i])**2,0)+error*10;
    if(!best||cost<best.cost)best={p,q:rounded,error,cost,tip:fk(rounded).tip};
   }
   return best;
  }
  return {angles,pulses,fk,qBounds,solve,clearance,clearanceIssue,inBox};
 }
 return {add,sub,mul,dot,norm,cross,unit,clamp,I,vector,point,compose,rotate,toGL,validPair,configValid,defaults,migrate,HOME,UPRIGHT,MEASURED_REVISION,MEASURED,calibrationPair,gripFraction,angle,pulse,gripper,smoothPath,create};
});
