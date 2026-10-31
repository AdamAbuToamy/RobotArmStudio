/* Offline articulated 3D model rendered by Canvas. Dimensions in millimetres.
   Shape/proportions follow the project's printed base, links and servo sizes.
   Pulse-to-angle calibration is visual only; there is no position feedback. */
(()=>{
const I={r:[1,0,0,0,1,0,0,0,1],t:[0,0,0]},rad=d=>d*Math.PI/180;
const apply=(a,p)=>[0,1,2].map(i=>a.t[i]+a.r[i*3]*p[0]+a.r[i*3+1]*p[1]+a.r[i*3+2]*p[2]);
function combine(a,b){return {r:Array.from({length:9},(_,n)=>{const i=Math.floor(n/3),j=n%3;return a.r[i*3]*b.r[j]+a.r[i*3+1]*b.r[j+3]+a.r[i*3+2]*b.r[j+6];}),t:apply(a,b.t)};}
function move(a,x,y,z){return combine(a,{r:I.r,t:[x,y,z]});}
function turn(a,axis,d){const c=Math.cos(rad(d)),s=Math.sin(rad(d));return combine(a,{r:axis==='x'?[1,0,0,0,c,-s,0,s,c]:axis==='y'?[c,0,s,0,1,0,-s,0,c]:[c,-s,0,s,c,0,0,0,1],t:[0,0,0]});}
function face(out,t,points,color){out.push({p:points.map(p=>apply(t,p)),color});}
function prism(out,t,outline,depth,color){const n=outline.length;face(out,t,outline.map(([x,y])=>[x,y,depth/2]),color);face(out,t,[...outline].reverse().map(([x,y])=>[x,y,-depth/2]),color);for(let i=0;i<n;i++){let a=outline[i],b=outline[(i+1)%n];face(out,t,[[...a,-depth/2],[...b,-depth/2],[...b,depth/2],[...a,depth/2]],color);}}
function box(out,t,w,h,d,col){prism(out,t,[[-w/2,0],[w/2,0],[w/2,h],[-w/2,h]],d,col);}
function cylinder(out,t,r,h,col,n=20){const bottom=[],top=[];for(let i=0;i<n;i++){let a=i*2*Math.PI/n,b=(i+1)*2*Math.PI/n;const x=r*Math.cos(a),z=r*Math.sin(a),u=r*Math.cos(b),v=r*Math.sin(b);bottom.push([x,0,z]);top.push([x,h,z]);face(out,t,[[x,0,z],[u,0,v],[u,h,v],[x,h,z]],col);}face(out,t,bottom.reverse(),col);face(out,t,top,col);}
function hub(out,t,r=22,depth=32){const h=turn(move(t,0,0,depth/2),'x',90);cylinder(out,h,r,depth,'#292d2e');cylinder(out,move(h,0,-1,0),r*.66,2,'#9da6a8');cylinder(out,move(h,0,-2,0),r*.25,1,'#dce1dd');}
const black='#343a3c',edge='#4b5153',white='#e3e3d7';
function servo(out,t,red=true){box(out,move(t,-2,-20,-28),46,40,20,red?'#c93342':'#3c4146');box(out,move(t,-2,18,-28),46,6,20,'#222729');}
function link(out,t,L,wide=34){
 // Two raised side rails leave a real opening through the printed link.
 for(const sign of [-1,1])prism(out,move(t,0,0,sign*11),[[sign*wide/2,0],[sign*(wide/2+3),L*.15],[sign*18,L-12],[sign*12,L],[sign*8,L-8],[sign*10,L*.15],[sign*10,4]],4,black);
 box(out,move(t,0,2,0),wide,16,26,black);box(out,move(t,0,L-18,0),30,18,26,black);
 // Narrow recessed middle strip and fastener bosses.
 box(out,move(t,0,L*.18,-8),12,L*.55,5,'#242a2c');
 for(const y of [12,L-10])for(const x of [-10,10])cylinder(out,turn(move(t,x,y,16),'x',90),2.2,2,'#c1c7c8',8);
}
function base(out,t,yaw,feet=true){
 cylinder(out,t,70,5,black,40);cylinder(out,move(t,0,5,0),49,52,black,40);cylinder(out,move(t,0,55,0),50,4,edge,40);
 if(feet)for(let i=0;i<5;i++){const f=turn(t,'y',i*72+18);box(out,move(f,0,0,110),18,5,125,black);box(out,move(f,0,4,110),4,5,125,edge);}
 const rotor=turn(move(t,0,59,0),'y',yaw);cylinder(out,rotor,39,9,'#252b2d',32);
 link(out,move(rotor,0,6,0),65,35);servo(out,move(rotor,0,66,0));hub(out,move(rotor,0,71,0),24,40);
 return move(rotor,0,71,0);
}
function wrist(out,t,angle){hub(out,t,17,32);const f=turn(t,'z',angle);link(out,f,48,25);box(out,move(f,0,-8,-24),24,24,13,'#60513d');return move(f,0,48,0);}
function roll(out,t,angle){cylinder(out,t,19,15,black,24);const f=turn(move(t,0,15,0),'y',angle);box(out,move(f,0,0,0),32,20,25,black);box(out,move(f,0,1,-20),23,22,13,'#60513d');return move(f,0,20,0);}
function grip(out,t,gap){
 box(out,t,44,9,30,black);
 for(const sign of [-1,1]){
  const f=move(t,sign*(12+gap),8,0);cylinder(out,turn(move(f,0,0,10),'x',90),8,20,white,14);
  const skew=sign*(gap/2-8);
  prism(out,f,[[sign*-5,0],[sign*5,0],[skew+sign*7,27],[skew+sign*4,48],[skew-sign*4,48],[skew-sign*6,25]],9,white);
  box(out,move(f,skew,37,-1),7,14,11,'#51544f');
  // A second linkage creates the familiar parallel-jaw silhouette.
  prism(out,move(f,0,0,-14),[[-3,0],[3,0],[skew+3,28],[skew-3,28]],4,white);
 }
}
let calibratedArm=null;
let values=[1100,1030,1650,1640,1400,1480],shown=[...values],config={zero:[...values],range:[180,180,180,180,180,120]},signs=[-1,1,-1,1,1,1];
let yaw=-.75,pitch=.25,zoom=1,dirty=true,frame=0;const minis=[];let canvas,ctx;
function angle(ch){if(calibratedArm&&ch<5)return calibratedArm.angles(shown)[ch]-window.ArmKinematics.UPRIGHT[ch];return (shown[ch]-config.zero[ch])/[1400,1400,1400,1400,1400,900][ch]*config.range[ch]*signs[ch];}
function jawGap(){const close=Number(document.getElementById('gripTarget')?.value)||1710;const f=window.ArmKinematics?.gripFraction(shown[5],close,signs[5],config.range[5]/120)??0;return (1-f)*15;}
function scene(){const out=[];let t=base(out,I,angle(0));t=turn(t,'z',angle(1));link(out,t,155,34);t=move(t,0,155,0);hub(out,t,22,40);servo(out,t,false);t=turn(t,'z',angle(2));link(out,t,105,32);t=move(t,0,105,0);t=wrist(out,t,angle(4));t=roll(out,t,angle(3));grip(out,t,jawGap());return out;}
// Control cards use flat symbols, independent of the full-arm 3D renderer.
function drawFlatPiece(c,g,ch){
 const box=c.getBoundingClientRect(),w=box.width||240,h=box.height||200,dpr=Math.min(devicePixelRatio||1,2);
 if(c.width!==Math.round(w*dpr)||c.height!==Math.round(h*dpr)){c.width=Math.round(w*dpr);c.height=Math.round(h*dpr);}
 g.setTransform(dpr,0,0,dpr,0,0);g.clearRect(0,0,w,h);
 const palette=[['#edf3df','#719440','#dce8be'],['#f8eee3','#bb7d48','#f0d3b3'],['#e8f0f6','#5086a3','#c8dfea'],['#f0eafa','#9070b5','#ddceed'],['#e4f3ed','#448f7e','#bfe1d5'],['#fbf0de','#b48b46','#efd9aa']];
 const [paper,accent,tint]=palette[ch],ink='#354d45';g.fillStyle=paper;g.fillRect(0,0,w,h);
 const size=ch===1?232:ch===4?248:210,scale=Math.min((w-22)/(size*.84),(h-20)/(size*.84)),ox=w/2,oy=h/2;
 g.save();g.translate(ox,oy);g.scale(scale,scale);g.lineCap='round';g.lineJoin='round';
 const circle=(x,y,r,fill,stroke=accent,lw=2)=>{g.beginPath();g.arc(x,y,r,0,Math.PI*2);if(fill){g.fillStyle=fill;g.fill();}if(stroke){g.strokeStyle=stroke;g.lineWidth=lw;g.stroke();}};
 const line=(a,b,color=accent,lw=8)=>{g.beginPath();g.moveTo(...a);g.lineTo(...b);g.strokeStyle=color;g.lineWidth=lw;g.stroke();};
 const path=(points,color=accent,lw=7)=>{g.beginPath();points.forEach((p,i)=>i?g.lineTo(...p):g.moveTo(...p));g.strokeStyle=color;g.lineWidth=lw;g.stroke();};
 const arc=(x,y,r,start,end,color=accent,lw=2)=>{g.beginPath();g.arc(x,y,r,start,end);g.strokeStyle=color;g.lineWidth=lw;g.stroke();};
 const ring=(x,y,r=14)=>{circle(x,y,r,paper,accent,3);circle(x,y,4,accent,null);};
 const endpoint=(x,y,length,theta)=>[x-Math.sin(theta)*length,y-Math.cos(theta)*length];
 const arm=(a,b,width=16)=>{line(a,b,accent,width);line(a,b,tint,width-6);};
 const theta=rad(angle(ch));
 if(ch===0){
  // The base is a dial, deliberately not a picture of the physical base.
  circle(0,0,80,tint,null);circle(0,0,70,paper,accent,2);
  for(let k=0;k<24;k++){const t=k*Math.PI/12,r=k%2?62:58;line([Math.sin(t)*r,-Math.cos(t)*r],[Math.sin(t)*65,-Math.cos(t)*65],accent,k%2?1.2:2.2);}
  g.save();g.rotate(-theta);line([0,0],[0,-47],accent,10);circle(0,-49,6,paper,accent,3);g.restore();
  ring(0,0,17);
 }
 if(ch===1){
  const root=[0,22],tip=endpoint(...root,71,theta);
  arc(...root,71,-Math.PI,0,tint,2);line([-33,48],[33,48],accent,5);line([0,48],root,accent,12);
  arm(root,tip,19);ring(...root,18);ring(...tip,10);
 }
 if(ch===2){
  const root=[-36,35],hinge=[3,3],tip=endpoint(...hinge,66,theta);
  arm(root,hinge,15);arc(...hinge,66,-Math.PI,0,tint,2);arm(hinge,tip,19);
  circle(...root,8,accent,null);ring(...hinge,17);ring(...tip,9);
 }
 if(ch===3){
  // Preserve the corrected axial motion mapping, using only arcs and strokes.
  circle(0,0,78,tint,null);circle(0,0,64,paper,null);
  arc(0,0,70,-Math.PI*.85,Math.PI*.55,accent,2.5);
  const t=Math.PI*.55;path([[Math.cos(t-.13)*78,Math.sin(t-.13)*78],[Math.cos(t)*70,Math.sin(t)*70],[Math.cos(t-.13)*63,Math.sin(t-.13)*63]],accent,2.5);
  g.save();g.rotate(-theta);
  path([[-27,-34],[-27,25],[27,25],[27,-34]],accent,11);
  line([-27,-34],[-13,-34],accent,8);line([27,-34],[13,-34],accent,8);ring(0,25,11);g.restore();
 }
 if(ch===4){
  const root=[0,32],tip=endpoint(...root,42,theta);
  arc(...root,77,-Math.PI,0,tint,2);line([-24,57],[24,57],accent,5);line([0,57],root,accent,10);
  arm(root,tip,17);ring(...root,16);
  g.save();g.translate(...tip);g.rotate(-theta);
  path([[-23,-34],[-23,0],[23,0],[23,-34]],accent,9);
  line([-23,-34],[-12,-34],accent,7);line([23,-34],[12,-34],accent,7);circle(0,0,5,paper,accent,2);g.restore();
 }
 if(ch===5){
  const spread=17+jawGap()*1.4;
  circle(0,0,78,tint,null);circle(0,0,65,paper,null);
  line([-27,39],[27,39],accent,12);
  for(const sign of [-1,1]){
   const x=spread*sign;arm([sign*18,39],[x,5],11);
   path([[x,5],[x,-39],[x-sign*14,-39]],accent,10);ring(x,5,8);
  }
 }
 g.restore();
 // Every symbol's complete sweep lies in its fixed logical frame; no zoom pumping.
 const half=size*scale/2;c._pieceBounds=[ox-half,oy-half,ox+half,oy+half];
}
// Flat paper washes, graphite contours and deterministic pencil hatching.
// Geometry/kinematics remain unchanged. No frame-random jitter or image assets.
function wash(hex){
 if(hex==='#c93342')return '#d9a38e';
 if(hex==='#e3e3d7')return '#f8eedb';
 if(['#9da6a8','#dce1dd','#c1c7c8'].includes(hex))return '#d6ded3';
 if(hex==='#60513d')return '#d9c5a4';
 if(hex==='#4b5153')return '#a8c6bd';
 return '#c2d2c8';
}
function draw(c,context,faces,center,span,ya,pi,zo=1,ground=false){
 const rect=c.getBoundingClientRect(),w=rect.width||c.clientWidth||320,h=rect.height||c.clientHeight||200,dpr=Math.min(devicePixelRatio||1,2);
 if(c.width!==Math.round(w*dpr)||c.height!==Math.round(h*dpr)){c.width=Math.round(w*dpr);c.height=Math.round(h*dpr);}
 context.setTransform(dpr,0,0,dpr,0,0);context.clearRect(0,0,w,h);
 const tones=['#eaf1e7','#f2e9df','#e4edf2','#ede8f6','#e0f0ed','#f5ecda'];
 if(ground){context.fillStyle='#f7f2e7';}
 else{const bg=context.createLinearGradient(0,0,w,h);bg.addColorStop(0,'#fafbf6');bg.addColorStop(1,tones[Number(c.closest('.joint-view')?.dataset.joint)||0]);context.fillStyle=bg;}
 context.fillRect(0,0,w,h);
 context.lineCap='round';context.lineJoin='round';
 // Quiet graph-paper background; fixed coordinates avoid shimmer on movement.
 context.strokeStyle='#7a9b8b14';context.lineWidth=.65;
 if(ground)for(let x=12;x<w;x+=24){context.beginPath();context.moveTo(x,0);context.lineTo(x,h);context.stroke();}
 if(ground)for(let y=12;y<h;y+=24){context.beginPath();context.moveTo(0,y);context.lineTo(w,y);context.stroke();}
 let scale=(ground?Math.min(w/440,h/610):Math.min(w,h)/span)*zo,cy=Math.cos(ya),sy=Math.sin(ya),cp=Math.cos(pi),sp=Math.sin(pi);
 function camera(p){let x=p[0]-center[0],y=p[1]-center[1],z=p[2]-center[2];let u=cy*x+sy*z,v=-sy*x+cy*z;return [u,cp*y-sp*v,sp*y+cp*v];}
 let ox=w/2,oy=h*.52;
 if(!ground && faces.length){
  // Fit every projected vertex, not an assumed arm length; wide poses stay in frame.
  const points=faces.flatMap(f=>f.p.map(camera));
  let minx=Infinity,maxx=-Infinity,miny=Infinity,maxy=-Infinity;
  for(const p of points){minx=Math.min(minx,p[0]);maxx=Math.max(maxx,p[0]);miny=Math.min(miny,p[1]);maxy=Math.max(maxy,p[1]);}
  const pad=Math.max(18,Math.min(w,h)*.12),dx=Math.max(1,maxx-minx),dy=Math.max(1,maxy-miny);
  const fit=Math.min((w-pad*2)/dx,(h-pad*2)/dy),previous=c._pieceScale??fit;
  scale=Math.min(fit,previous*.82+fit*.18);c._pieceScale=scale;
  ox=w/2-(minx+maxx)*scale/2;oy=h/2+(miny+maxy)*scale/2;
  c._pieceBounds=[ox+minx*scale,oy-maxy*scale,ox+maxx*scale,oy-miny*scale];
  context.fillStyle='#334e4b0c';context.beginPath();context.ellipse(w/2,h-pad*.65,w*.25,5,0,0,Math.PI*2);context.fill();
 }
 const screen=p=>[ox+p[0]*scale,oy-p[1]*scale];
 if(ground){
  const p=screen(camera([0,0,0]));context.strokeStyle='#597a6c55';context.lineWidth=1;context.setLineDash([4,6]);
  context.beginPath();context.ellipse(p[0],p[1],105*scale,35*scale,0,0,Math.PI*2);context.stroke();context.setLineDash([]);
 }
 const polys=faces.map((f,index)=>{let p=f.p.map(camera),a=p[0],b=p[1],c=p[2],u=b.map((v,i)=>v-a[i]),v=c.map((q,i)=>q-a[i]);
  let n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],len=Math.hypot(...n)||1;
  return {world:f.p,p,xy:p.map(screen),n:n.map(v=>v/len),index,z:p.reduce((s,v)=>s+v[2],0)/p.length,color:f.color};
 });
 // Share mesh edges: discard internal cylinder seams and coplanar edges.
 const edgeMap=new Map();
 const vertex=p=>p.map(v=>Math.round(v*100)).join(',');
 for(const f of polys){f.edges=[];for(let i=0;i<f.world.length;i++){
  const a=vertex(f.world[i]),b=vertex(f.world[(i+1)%f.world.length]),key=a<b?a+'|'+b:b+'|'+a;
  let e=edgeMap.get(key);if(!e){e=[];edgeMap.set(key,e);}e.push(f);f.edges.push(e);
 }}
 polys.sort((a,b)=>a.z-b.z);
 for(const f of polys){
  const path=()=>{context.beginPath();f.xy.forEach((p,i)=>i?context.lineTo(...p):context.moveTo(...p));context.closePath();};
  path();
  if(ground)context.fillStyle=wash(f.color);
  else{
   // Toy-like technical illustration: graphite body, mint rails and coral motor.
   const colors={'#c93342':['#f4ac8c','#ce725c'],'#e3e3d7':['#fffdf2','#d8cbb3'],
    '#9da6a8':['#dcece6','#85b8ac'],'#dce1dd':['#fffdf2','#bdd7c6'],
    '#c1c7c8':['#e1eee7','#a4c7b5'],'#4b5153':['#82c4ad','#4c927f'],
    '#60513d':['#c2b4e1','#9385b5']};
   const pair=colors[f.color]||['#6d8c88','#405c5c'];
   const shade=context.createLinearGradient(0,Math.min(...f.xy.map(p=>p[1])),w,Math.max(...f.xy.map(p=>p[1])));
   shade.addColorStop(0,pair[0]);shade.addColorStop(1,pair[1]);context.fillStyle=shade;
  }
  context.fill();
  const area=Math.abs(f.xy.reduce((s,p,i)=>{let q=f.xy[(i+1)%f.xy.length];return s+p[0]*q[1]-q[0]*p[1];},0))/2;
  // Sparse clipped pencil shading replaces realistic lighting/materials.
  if(ground && area>140 && f.index%3===0 && Math.abs(f.n[0])>.35){
   context.save();path();context.clip();
   const xs=f.xy.map(p=>p[0]),ys=f.xy.map(p=>p[1]),minx=Math.min(...xs),maxx=Math.max(...xs),miny=Math.min(...ys),maxy=Math.max(...ys);
   context.strokeStyle='#46635430';context.lineWidth=.7;
   for(let x=minx-(maxy-miny);x<maxx;x+=7){context.beginPath();context.moveTo(x,maxy+1);context.lineTo(x+maxy-miny,miny-1);context.stroke();}
   context.restore();
  }
  for(let i=0;i<f.xy.length;i++){
   const shared=f.edges[i],crease=shared.some(o=>o!==f&&(o.color!==f.color||o.n.reduce((v,n,k)=>v+n*f.n[k],0)<.82||o.n[2]*f.n[2]<0));
   if(shared.length>1&&!crease)continue;
   const a=f.xy[i],b=f.xy[(i+1)%f.xy.length],len=Math.hypot(b[0]-a[0],b[1]-a[1]);
   context.strokeStyle=ground?'#344b42':'#2c494bdd';context.lineWidth=ground?1.05:1.05;
   context.beginPath();context.moveTo(...a);context.lineTo(...b);context.stroke();
   if(ground && len>10){
    const dx=(b[0]-a[0])/len,dy=(b[1]-a[1])/len,offset=.75;
    context.strokeStyle='#344b4245';context.lineWidth=.55;
    context.beginPath();context.moveTo(a[0]-dx*.7-dy*offset,a[1]-dy*.7+dx*offset);
    context.quadraticCurveTo((a[0]+b[0])/2-dy*1.2,(a[1]+b[1])/2+dx*1.2,b[0]+dx*.6-dy*offset,b[1]+dy*.6+dx*offset);context.stroke();
   }
  }
 }

}
function initialize(){
 canvas=document.getElementById('robotCanvas');if(!canvas)return;
 try{ctx=canvas.getContext('2d');}catch{}if(!ctx)return;
 document.querySelectorAll('.joint-canvas').forEach((c,i)=>{let context;try{context=c.getContext('2d');}catch{}if(context)minis.push({c,context,i});});
 let drag=null;const fingers=new Map();
 canvas.onpointerdown=e=>{canvas.setPointerCapture?.(e.pointerId);fingers.set(e.pointerId,[e.clientX,e.clientY]);drag=[e.clientX,e.clientY];};
 canvas.onpointermove=e=>{if(!fingers.has(e.pointerId))return;const old=fingers.get(e.pointerId);fingers.set(e.pointerId,[e.clientX,e.clientY]);if(fingers.size===1){yaw+=(e.clientX-old[0])*.008;pitch=Math.max(-.2,Math.min(1.2,pitch+(e.clientY-old[1])*.007));}else{const points=[...fingers.entries()];const other=points.find(([id])=>id!==e.pointerId)?.[1];if(other){const before=Math.hypot(old[0]-other[0],old[1]-other[1]),after=Math.hypot(e.clientX-other[0],e.clientY-other[1]);if(before>0)zoom=Math.max(.5,Math.min(2.5,zoom*after/before));}}dirty=true;};
 for(const ev of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(ev,e=>{fingers.delete(e.pointerId);drag=null;});
 canvas.addEventListener('wheel',e=>{e.preventDefault();zoom=Math.max(.5,Math.min(2.5,zoom*Math.exp(-e.deltaY*.001)));dirty=true;},{passive:false});
 for(const [id,y,p] of [['viewFront',0,.05],['viewSide',Math.PI/2,.05],['viewReset',-.75,.25]])document.getElementById(id).onclick=()=>{yaw=y;pitch=p;zoom=1;dirty=true;};
 window.addEventListener('resize',()=>dirty=true);
 function animate(now){requestAnimationFrame(animate);if(now-frame<40||document.hidden)return;frame=now;let changed=false;
  if(document.getElementById('simFollow')?.checked)for(let i=0;i<6;i++){const d=values[i]-shown[i];if(Math.abs(d)>.05){shown[i]+=d*.55;changed=true;}}
  if(!dirty&&!changed)return;dirty=false;
  if(!window.STLStudioActive&&!document.getElementById('page-simulation').hidden)draw(canvas,ctx,scene(),[0,255,0],610,yaw,pitch,zoom,true);
  if(!document.getElementById('page-control').hidden)for(const {c,context,i} of minis)drawFlatPiece(c,context,i);
 }
 requestAnimationFrame(animate);
}
window.RobotView={update(p){if(Array.isArray(p)&&p.length===6){values=[...p];dirty=true;}},configure(c,s,cal){config=structuredClone(c);signs=[...s];if(cal&&window.ArmKinematics&&window.ROBOT_STL)calibratedArm=window.ArmKinematics.create(window.ROBOT_STL,cal);dirty=true;},resize(){dirty=true;},getModel(){return scene();},getJointAngles(){return [0,1,2,3,4].map(angle);}};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initialize);else initialize();
})();
