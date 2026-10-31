/* Browser regression suite. WebSocket motor traffic is mocked; no serial port is opened. */
const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const {spawn}=require('node:child_process');const {chromium}=require('playwright');
const ROOT=path.resolve(__dirname,'..'),BASE='http://127.0.0.1:8876',TOKEN='local-ui-test';
(async()=>{
 const server=spawn(process.env.PYTHON||'python',[path.join(__dirname,'run_server.py')],{cwd:ROOT,stdio:['ignore','ignore','inherit']});let browser;const results=[];
 const check=async(name,fn)=>{await fn();results.push({name,status:'passed'});console.log('PASS',name);};
 try{
  for(let i=0;i<50;i++){try{const r=await fetch(BASE);if(r.ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{}),args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],commands=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/ports',r=>r.fulfill({json:[{port:'MOCK',name:'Simulated controller'}]}));
  await page.route('**/api/connect',r=>r.fulfill({json:{ok:true}}));
  await page.routeWebSocket('**/ws*',ws=>{
   let armed=Array(6).fill(0),p=[1100,1030,1650,1640,1400,1480],hold=0;
   const state=()=>ws.send('STATE20 '+[...p,...armed,1,0,0,1710,0,hold,0,63].join(' '));
   const interval=setInterval(()=>{try{state();}catch{}},180);ws.onClose(()=>clearInterval(interval));
   ws.onMessage(line=>{commands.push(String(line));const [id,op,...args]=String(line).split(' ');if(op==='HELLO'){ws.send('RAS20');ws.send('LIMITS20 800 2200 800 2200 800 2200 800 2200 800 2200 810 1710');state();return;}
    if(op==='ARMALL')armed.fill(1);if(op==='ARM')armed[+args[0]]=1;if(op==='HOLD90')hold=+args[0];
    ws.send('ACK '+id);state();if(['ARMALL','MOVE','SEQRUN','INIT'].includes(op))setTimeout(()=>ws.send('DONE '+id),30);
   });
  });
  await check('Disconnected UI loads with no automatic activation',async()=>{await page.goto(BASE+'/?token='+TOKEN);await page.waitForTimeout(500);assert.equal(await page.locator('html').getAttribute('lang'),'en');assert.equal(await page.locator('#arm').isDisabled(),true);assert.equal(await page.locator('#capture').isDisabled(),true);assert.equal(commands.length,0);});
  await check('Light interface restores six rendered, selectable joint diagrams',async()=>{
   assert.equal(await page.locator('.joint-canvas').count(),6);
   await page.waitForFunction(()=>[...document.querySelectorAll('.joint-canvas')].every(c=>{const g=c.getContext('2d');return c.width>0&&c.height>0&&g.getImageData(c.width/2,c.height/2,1,1).data[3]>0;}));
   const light=await page.evaluate(()=>getComputedStyle(document.documentElement).colorScheme);assert.equal(light,'light');
   for(let i=0;i<6;i++){await page.locator('#joint'+i).click();assert.equal(await page.locator('#joint'+i).getAttribute('class'),'axis-button selected');}
   await page.locator('#joint0').click();assert.equal(commands.length,0);
  });
  await check('Every page renders in English and Arabic without overflow',async()=>{
   for(const lang of ['en','ar']){await page.locator('#languageSelect').selectOption(lang);for(const name of ['control','simulation','library','settings','project']){await page.locator(`.nav-item[data-page="${name}"]`).click();await page.waitForTimeout(name==='simulation'?200:30);assert.equal(await page.locator('#page-'+name).isVisible(),true);const over=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);assert.equal(over,false,lang+' '+name);}
    if(lang==='en'){const text=await page.locator('#page-project').innerText();assert.equal(/[\u0600-\u06ff]/.test(text),false,text);}
   }
   assert.equal(await page.locator('html').getAttribute('dir'),'rtl');
  });
  await check('Everyday controls hide engineering readouts and keep tuning in closed advanced settings',async()=>{
   for(const lang of ['en','ar']){
    await page.locator('#languageSelect').selectOption(lang);await page.locator('.nav-item[data-page="control"]').click();
    const text=await page.locator('#page-control').innerText();assert.equal(/µs|°|CH ?0|channel|2200|800|نبضة|قناة|حدود/.test(text),false,text);
    assert.equal(await page.locator('#jointRange').isVisible(),false);
    await page.locator('#manualToggle').click();assert((await page.locator('#speedValue').innerText()).endsWith('%'));await page.locator('#manualToggle').click();
    await page.locator('.nav-item[data-page="settings"]').click();assert.equal(await page.locator('#advancedSettings').getAttribute('open'),null);assert.equal(await page.locator('#limitMin').isVisible(),false);
   }
  });
  await check('Project identifies the purchased-model designer near the introduction and explains the build',async()=>{
   for(const lang of ['en','ar']){
    await page.locator('#languageSelect').selectOption(lang);await page.locator('.nav-item[data-page="project"]').click();
    const source=page.locator('.source-credit');assert((await source.innerText()).includes('FABRI_CREATOR'));assert.equal(await source.isVisible(),true);
    assert((await source.boundingBox()).y<900);assert(parseFloat(await source.evaluate(e=>getComputedStyle(e).fontSize))>=12);
    assert((await page.locator('#page-project').innerText()).length>2400);assert((await page.locator('.project-list li').count())>=5);
   }
  });
  await check('Sketch workspace retains source geometry and supports picking and camera rotation',async()=>{
   await page.locator('.nav-item[data-page="simulation"]').click();await page.waitForTimeout(200);
   const state=await page.evaluate(()=>({view:CartesianStudio.getState(),source:{sha256:ROBOT_STL.sha256,triangles:ROBOT_STL.triangles},schematic:window.ROBOT_MODEL_KIND==='schematic'}));
   assert.equal(state.view.webgl,true);assert.equal(state.view.modelHash,state.source.sha256);assert.equal(state.view.triangles,state.source.triangles);
   if(!state.schematic)assert(state.view.triangles>100000);
   const position=await page.evaluate(()=>CartesianStudio.project([120,0,200]));const rect=await page.locator('#stlCanvas').boundingBox();
   await page.mouse.click(rect.x+position[0],rect.y+position[1]);await page.waitForTimeout(100);
   const target=await page.evaluate(()=>CartesianStudio.getState().target);assert(Math.abs(target[0]-120)<3&&Math.abs(target[1])<3&&target[2]===200,JSON.stringify(target));
   const before=await page.evaluate(()=>CartesianStudio.project([120,0,200]));await page.mouse.move(rect.x+rect.width/2,rect.y+rect.height/2);await page.mouse.down();await page.mouse.move(rect.x+rect.width/2+50,rect.y+rect.height/2+20,{steps:5});await page.mouse.up();await page.waitForTimeout(150);
   const after=await page.evaluate(()=>CartesianStudio.project([120,0,200]));assert(Math.hypot(after[0]-before[0],after[1]-before[1])>1);
   assert.equal(commands.length,0);
  });
  await check('Subtle page animation respects reduced-motion preferences',async()=>{
   await page.emulateMedia({reducedMotion:'no-preference'});await page.locator('.nav-item[data-page="control"]').click();
   assert.notEqual(await page.locator('#page-control').evaluate(e=>getComputedStyle(e).animationName),'none');
   await page.emulateMedia({reducedMotion:'reduce'});await page.locator('.nav-item[data-page="project"]').click();
   assert.equal(await page.locator('#page-project').evaluate(e=>getComputedStyle(e).animationName),'none');
   await page.emulateMedia({reducedMotion:'no-preference'});
  });
  await check('Phone access starts and stops from the website without a second server command',async()=>{
   const initial=await (await fetch(BASE+'/api/phone',{headers:{Authorization:'Bearer '+TOKEN}})).json();assert.equal(initial.enabled,false);
   await page.locator('#phoneAccess').click();await page.locator('#disablePhone').waitFor({state:'visible'});
   const active=await (await fetch(BASE+'/api/phone',{headers:{Authorization:'Bearer '+TOKEN}})).json();assert.equal(active.enabled,true);assert(active.port>0);
   const phonePage=await fetch('http://127.0.0.1:'+active.port+'/');assert((await phonePage.text()).includes('pairCode'));
   await page.locator('#phoneQr').waitFor({state:'visible'});
   await page.locator('#disablePhone').click();await page.locator('#enablePhone').waitFor({state:'visible'});
   const off=await (await fetch(BASE+'/api/phone',{headers:{Authorization:'Bearer '+TOKEN}})).json();assert.equal(off.enabled,false);
   await page.locator('#closePhoneDialog').click();
  });
  await check('Language changes preserve an unsaved calibration input',async()=>{await page.locator('.nav-item[data-page="settings"]').click();await page.locator('#advancedSettings>summary').click();await page.locator('[data-settings-tab="calibration"]').click();await page.locator('#xyzCal0pA').fill('1234');await page.locator('#languageSelect').selectOption('en');assert.equal(await page.locator('#xyzCal0pA').inputValue(),'1234');assert.equal(await page.locator('html').getAttribute('dir'),'ltr');});
  await check('Connect and explicitly activate through mocked protocol',async()=>{await page.locator('.nav-item[data-page="control"]').click();await page.locator('#connect').click();await page.waitForFunction(()=>usable());assert.equal(commands.some(c=>/ ARMALL\b/.test(c)),false);await page.locator('#armAll').click();await page.waitForFunction(()=>both()&&!commanding);assert.equal(await page.locator('#capture').isEnabled(),true);});
  await check('Pointer release, Escape and page changes stop manual movement',async()=>{
   const left=page.locator('#left');await left.hover();await page.mouse.down();await page.waitForTimeout(150);await page.mouse.up();await page.waitForTimeout(50);assert(commands.some(c=>/ JOG 0 -1 /.test(c)));
   const before=commands.length;await page.keyboard.press('Escape');await page.waitForTimeout(50);assert(commands.slice(before).some(c=>/ STOP$/.test(c)));
   await page.keyboard.down('ArrowLeft');await page.waitForTimeout(80);await page.locator('.nav-item[data-page="project"]').click();await page.keyboard.up('ArrowLeft');assert.equal(await page.evaluate(()=>heldKeys.size),0);assert(commands.some(c=>/ STOPMOVE$/.test(c)));
  });
  await check('Capture, rename, save, edit, reload and replay a routine',async()=>{
   await page.locator('.nav-item[data-page="control"]').click();await page.locator('#capture').click();await page.locator('.nav-item[data-page="library"]').click();await page.locator('#newRoutine').click();
   await page.locator('.nav-item[data-page="control"]').click();await page.locator('#capture').click();await page.locator('.nav-item[data-page="library"]').click();
   await page.evaluate(()=>showPage('editor'));await page.locator('#routineName').fill('Acceptance routine');await page.locator('.poseName').fill('First pose');await page.locator('.poseName').blur();await page.locator('#save').click();await page.waitForTimeout(250);
   await page.locator('.nav-item[data-page="library"]').click();assert.equal(await page.locator('.routine-card h3').textContent(),'Acceptance routine');await page.locator('.routine-card button').filter({hasText:'Open'}).click();assert.equal(await page.locator('.poseName').inputValue(),'First pose');
   await page.locator('#play').click();await page.waitForTimeout(400);assert(commands.some(c=>/ SEQBEGIN /.test(c)));assert(commands.some(c=>/ SEQRUN\b/.test(c)));
   await page.reload();await page.waitForTimeout(400);await page.locator('.nav-item[data-page="library"]').click();assert.equal(await page.locator('.routine-card h3').textContent(),'Acceptance routine');
  });
  await check('Physical-media gallery upload persists and requires authorization',async()=>{
   await page.locator('.nav-item[data-page="project"]').click();const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
   await page.locator('#projectMediaFiles').setInputFiles({name:'Test-only-image.png',mimeType:'image/png',buffer:png});await page.waitForFunction(()=>document.querySelectorAll('#mediaGallery img').length===1);await page.reload();await page.waitForTimeout(250);assert.equal(await page.locator('#mediaGallery img').count(),1);
   const r=await fetch(BASE+'/api/media');assert.equal(r.status,401);
  });
  await check('Paired visitors see the gallery without upload or delete controls',async()=>{
   const state=await (await fetch(BASE+'/api/phone',{headers:{Authorization:'Bearer '+TOKEN}})).json();
   const pair=await (await fetch(BASE+'/api/pair',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pin:state.pin})})).json();
   assert.notEqual(pair.token,TOKEN);
   const guest=await browser.newPage({viewport:{width:390,height:844}});
   try{
    await guest.goto(BASE+'/?token='+encodeURIComponent(pair.token)+'#project');
    await guest.locator('.nav-item[data-page="project"]').click();
    await guest.waitForFunction(()=>document.querySelectorAll('#mediaGallery img').length===1);
    assert.equal(await guest.locator('#projectMediaControls').isVisible(),false);
    assert.equal(await guest.locator('#projectMediaFiles').isDisabled(),true);
    assert.equal(await guest.locator('#mediaGallery button').count(),0);
    for(const lang of ['en','ar']){await guest.locator('#languageSelect').selectOption(lang);assert.equal(await guest.locator('#projectMediaControls').isVisible(),false);}
    const rejected=await fetch(BASE+'/api/media',{method:'POST',headers:{Authorization:'Bearer '+pair.token},body:'direct visitor upload'});assert.equal(rejected.status,403);
   }finally{await guest.close();}
  });
  await check('Phone layout keeps Stop visible and has no horizontal scrolling',async()=>{
   await page.setViewportSize({width:390,height:844});for(const lang of ['en','ar']){await page.locator('#languageSelect').selectOption(lang);for(const name of ['control','simulation','library','settings','project']){await page.locator(`.nav-item[data-page="${name}"]`).click();await page.waitForTimeout(30);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,lang+' '+name);assert.equal(await page.locator('#stop').isVisible(),true);}}
   await page.screenshot({path:process.env.INTERNAL_SCREENSHOT||'/tmp/robot-ui-mobile-internal.png',fullPage:true});
  });
  await check('No uncaught browser errors',async()=>assert.deepEqual(errors,[]));
  fs.writeFileSync(path.join(ROOT,'test-results.json'),JSON.stringify({date:new Date().toISOString(),transport:'mocked; no physical serial port opened',checks:results},null,2));
 }catch(e){console.error(e);process.exitCode=1;}finally{if(browser)await browser.close();server.kill();}
})();
