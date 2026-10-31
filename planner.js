/* Bounded offline joint-space search. Geometry checks are conservative/sampled,
   not environmental collision sensing. Never emits hardware commands. */
(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./kinematics.js'):root.ArmKinematics);if(typeof module==='object'&&module.exports)module.exports=api;else root.RobotPlanner=api;})(typeof globalThis!=='undefined'?globalThis:this,K=>{
 async function plan(arm,target,start,limits,options={}){
  const allowWrist=options.allowWrist!==false,active=allowWrist?[0,1,2,3,4]:[0,1,2],maxIterations=options.maxIterations??720;
  const deadline=Date.now()+(options.maxMs??45000);
  const pause=options.yield||(()=>new Promise(r=>setTimeout(r,0))),cancel=()=>{if(options.cancelled?.())throw Error('CANCELLED');if(Date.now()>deadline)throw Error('SEARCH_LIMIT');};
  let work=0,seed=77137;const rand=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
  const yieldNow=async()=>{cancel();await pause();cancel();},check=async p=>{if(++work%32===0)await yieldNow();return p.every((v,c)=>Number.isFinite(v)&&v>=limits[c][0]&&v<=limits[c][1])&&p[5]===start[5]&&arm.clearance(arm.angles(p));};
  const dist=(a,b)=>Math.hypot(...active.map(c=>(a[c]-b[c])/(limits[c][1]-limits[c][0])));
  async function edge(a,b,resolution=.75){const qa=arm.angles(a),qb=arm.angles(b),n=Math.max(2,Math.ceil(Math.max(...qa.map((v,c)=>Math.abs(v-qb[c])))/resolution));for(let i=0;i<=n;i++){const p=a.map((v,c)=>v+(b[c]-v)*i/n);if(!await check(p))return false;}return true;}
  if(!target.every(Number.isFinite)||!arm.inBox(target)||!await check(start))return {ok:false,reason:'input'};
  options.progress?.('goals');
  const diagnostics={target:[...target],start:[...start],limits:limits.map(p=>[...p]),allowWrist,attempts:0,nearestError:null};
  const goals=[];const addGoal=s=>{if(s&&!goals.some(g=>dist(g.p,s.p)<.015))goals.push(s);};
  addGoal(arm.solve(target,start,limits,{report:diagnostics}));await yieldNow();
  const home=K.HOME.map((v,c)=>Math.round(K.clamp(v,...limits[c])));if(!allowWrist){home[3]=start[3];home[4]=start[4];}home[5]=start[5];
  // Halton coverage of the full bounded joint space; Cartesian nearest seeds
  // are refined by IK. Keep fingers and any locked wrist exactly unchanged.
  const halton=(n,b)=>{let f=1,r=0;while(n){f/=b;r+=f*(n%b);n=Math.floor(n/b);}return r;};
  const primes=[2,3,5,7,11],atlas=[],samples=options.atlasSamples??2048;
  for(let i=1;i<=samples;i++){
   const p=[...start];active.forEach((c,j)=>p[c]=Math.round(limits[c][0]+halton(i,primes[j])*(limits[c][1]-limits[c][0])));
   const q=arm.angles(p),tip=arm.fk(q).tip;
   atlas.push({p,index:i,d:Math.hypot(...target.map((v,c)=>v-tip[c]))});
   if(i%64===0)await yieldNow();
  }
  atlas.sort((a,b)=>a.d-b.d);
  const seeds=[start,home,...atlas.slice(0,64).map(n=>n.p)];
  for(const p of seeds){cancel();addGoal(arm.solve(target,p,limits,{wrist:allowWrist,multi:false,report:diagnostics}));await yieldNow();if(goals.length>=16)break;}
  // Broaden restarts if the nearest atlas samples lie on an obstructed branch.
  if(!goals.length)for(let i=64;i<Math.min(256,atlas.length);i++){
   addGoal(arm.solve(target,atlas[i].p,limits,{wrist:allowWrist,multi:false,report:diagnostics}));
   await yieldNow();if(goals.length>=8)break;
  }
  if(!goals.length)return {ok:false,reason:'goal',checks:work,diagnostics};
  goals.sort((a,b)=>dist(start,a.p)-dist(start,b.p));
  async function finish(points){
   points=points.map(p=>p.map(Math.round));
   // Remove unnecessary corners; keep the route compact and avoid tiny segment playback.
   for(let i=0;i<points.length-2;i++)for(let j=points.length-1;j>i+1;j--)if(await edge(points[i],points[j])){points.splice(i+1,j-i-1);break;}
   if(points.length>100)return null;
   for(let i=1;i<points.length;i++)if(!await edge(points[i-1],points[i],.15))return null;
   // Timing is uniform. The controller may uniformly lengthen it for speed/accel/jerk limits.
   const caps=[600,600,600,300,300,150];let segmentMs=Math.max(200,Math.ceil((options.durationMs||6000)/(points.length-1)));
   for(let i=1;i<points.length;i++)for(let c=0;c<6;c++)segmentMs=Math.max(segmentMs,Math.ceil(1000*Math.abs(points[i][c]-points[i-1][c])/caps[c]));
   segmentMs+=2;
   let blend=points.length>2,curve=points.length===2?null:K.smoothPath(points,Math.max(24,Math.ceil(Math.max(...points.slice(1).map((p,i)=>Math.max(...p.map((v,c)=>Math.abs(v-points[i][c])))))/2)));
   if(curve)for(const p of curve)if(!await check(p)){blend=false;break;}
   // With blending disabled the native minimum-jerk moves follow the validated straight edges.
   const preview=[];
   if(blend)for(let i=0;i<curve.length;i+=Math.max(1,Math.floor(curve.length/150)))preview.push(arm.fk(arm.angles(curve[i])).tip);
   else for(let i=1;i<points.length;i++){if(!await edge(points[i-1],points[i],.15))return null;for(let k=0;k<=12;k++)preview.push(arm.fk(arm.angles(points[i-1].map((v,c)=>v+(points[i][c]-v)*k/12))).tip);}
   return {ok:true,points,blend,segmentMs,preview,tip:arm.fk(arm.angles(points.at(-1))).tip,allowWrist,checks:work};
  }
  for(const g of goals)if(await edge(start,g.p)){const r=await finish([start,g.p]);if(r)return {...r,algorithm:"direct"};}
  options.progress?.('detour');
  // Known torso-up and lifted configurations are cheaper than sampling a general tree.
  const mids=[home];for(const h of [.25,.5,.75,.9]){const p=[...home];p[0]=start[0];p[1]=Math.round(limits[1][0]+h*(limits[1][1]-limits[1][0]));mids.push(p);}
  for(const mid of mids){if(!await check(mid)||!await edge(start,mid))continue;for(const g of goals){if(await edge(mid,g.p)){const r=await finish([start,mid,g.p]);if(r)return r;}const turn=[...mid];turn[0]=g.p[0];if(await check(turn)&&await edge(mid,turn)&&await edge(turn,g.p)){const r=await finish([start,mid,turn,g.p]);if(r)return r;}}}
  // Progressive Lazy PRM: A* searches a k-nearest roadmap, then validates
  // only the candidate route's edges. Invalid edges are removed and A* reruns.
  // Euclidean normalized joint distance is an admissible A* heuristic.
  options.progress?.('roadmap');
  const nodes=[[...start],...goals.map(g=>g.p)],goalIds=new Set(goals.map((_,i)=>i+1));
  const edgeCache=new Map(),key=(a,b)=>a<b?a+':'+b:b+':'+a;
  const addNode=async p=>{if(!nodes.some(n=>dist(n,p)<.004)&&await check(p))nodes.push(p);};
  for(const mid of mids)await addNode(mid);
  // Structured single-axis transitions supplement global samples at boundaries.
  for(const anchor of [start,home,...goals.slice(0,4).map(g=>g.p)])for(const c of active)for(const f of [0,.25,.5,.75,1]){
   const p=[...anchor];p[c]=Math.round(limits[c][0]+f*(limits[c][1]-limits[c][0]));await addNode(p);
  }
  const globalSamples=[...atlas].sort((a,b)=>a.index-b.index),roadmapSamples=[];
  for(let i=0;i<atlas.length;i++){roadmapSamples.push(globalSamples[i]);if(i<256)roadmapSamples.push(atlas[i]);}
  let cursor=0,expanded=0;
  for(const size of (options.roadmapSizes||[256,640,1400])){
   while(nodes.length<size&&cursor<roadmapSamples.length){await addNode(roadmapSamples[cursor++].p);if(cursor%16===0)await yieldNow();}
   const graph=nodes.map(()=>new Map()),neighbors=Math.min(nodes.length-1,size>=640?24:16);
   for(let i=0;i<nodes.length;i++){
    const nearest=nodes.map((p,j)=>({j,d:i===j?Infinity:dist(nodes[i],p)})).sort((a,b)=>a.d-b.d).slice(0,neighbors);
    for(const {j,d} of nearest){graph[i].set(j,d);graph[j].set(i,d);}
    if(i%32===0)await yieldNow();
   }
   const heuristic=nodes.map(p=>Math.min(...goals.map(g=>dist(p,g.p))));
   async function astar(){
    const g=Array(nodes.length).fill(Infinity),parent=Array(nodes.length).fill(-1),open=new Set([0]),closed=new Set();g[0]=0;
    while(open.size){
     let u=-1,best=Infinity;for(const i of open){const f=g[i]+heuristic[i];if(f<best){best=f;u=i;}}
     if(goalIds.has(u)){const path=[];for(let i=u;i>=0;i=parent[i])path.push(i);return path.reverse();}
     open.delete(u);closed.add(u);
     for(const [v,d] of graph[u])if(!closed.has(v)&&edgeCache.get(key(u,v))!==false&&g[u]+d<g[v]){g[v]=g[u]+d;parent[v]=u;open.add(v);}
     if(++expanded%64===0)await yieldNow();
    }
    return null;
   }
   options.progress?.('astar',nodes.length);
   for(;;){
    cancel();const path=await astar();if(!path)break;let valid=true;
    for(let i=1;i<path.length;i++){
     const a=path[i-1],b=path[i],k=key(a,b);let ok=edgeCache.get(k);
     if(ok===undefined){ok=await edge(nodes[a],nodes[b]);edgeCache.set(k,ok);}
     if(!ok){valid=false;break;}
    }
    if(valid){const result=await finish(path.map(i=>nodes[i]));if(result)return {...result,algorithm:'PRM-A*',nodes:nodes.length,expanded};
     // A dense validation failure must invalidate the actual offending edge,
     // rather than repeatedly searching the same coarse candidate.
     for(let i=1;i<path.length;i++)if(!await edge(nodes[path[i-1]],nodes[path[i]],.15)){edgeCache.set(key(path[i-1],path[i]),false);valid=false;break;}
     if(valid)break;
    }
    await yieldNow();
   }
   if(cursor>=roadmapSamples.length)break;
  }
  // Bidirectional RRT-Connect between the start and several valid endpoint branches.
  const left=[{p:[...start],parent:-1}],right=goals.map(g=>({p:g.p,parent:-1}));
  const trace=(tree,i)=>{const out=[];while(i>=0){out.push(tree[i].p);i=tree[i].parent;}return out.reverse();};
  async function extend(tree,target){let nearest=0,d=Infinity;tree.forEach((n,i)=>{const v=dist(n.p,target);if(v<d){d=v;nearest=i;}});if(d<1e-8)return {index:nearest,reached:true};const f=Math.min(1,.13/d),p=tree[nearest].p.map((v,c)=>active.includes(c)?Math.round(v+(target[c]-v)*f):start[c]);if(dist(p,tree[nearest].p)<1e-7||!await edge(tree[nearest].p,p))return null;tree.push({p,parent:nearest});return {index:tree.length-1,reached:dist(p,target)<.001};}
  for(let iter=0;iter<maxIterations;iter++){
   cancel();if(iter%4===0)await yieldNow();const swap=iter%2===1,A=swap?right:left,B=swap?left:right,sample=[...start];active.forEach(c=>sample[c]=Math.round(limits[c][0]+rand()*(limits[c][1]-limits[c][0])));if(iter%5===0)Object.assign(sample,B[Math.floor(rand()*B.length)].p);
   const a=await extend(A,sample);if(!a)continue;let b=null;for(let j=0;j<20;j++){b=await extend(B,A[a.index].p);if(!b||b.reached)break;}
   if(b?.reached){const L=trace(left,swap?b.index:a.index),R=trace(right,swap?a.index:b.index).reverse();if(dist(L.at(-1),R[0])>.005||!await edge(L.at(-1),R[0]))continue;const result=await finish([...L,...R.slice(1)]);if(result)return result;}
  }
  return {ok:false,reason:'route',checks:work,diagnostics};
 }
 return {plan};
});
