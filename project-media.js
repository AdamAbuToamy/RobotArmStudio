/* Media belongs to this physical build. References are never labelled as Adam's robot. */
class ProjectMediaStore {
  constructor(){this.urls=[];this.canManage=false;this.input=document.getElementById('projectMediaFiles');this.input.addEventListener('change',()=>this.add(this.input.files));document.addEventListener('studio:language',()=>this.render());this.initialize();}
  async initialize(){
    // Fail closed: hiding the editor is presentation; the server independently
    // enforces the owner's credential and local desktop scope on every mutation.
    if(BRIDGE){try{const r=await fetch('/api/capabilities',{headers:{Authorization:'Bearer '+AUTH}});if(r.ok)this.canManage=(await r.json()).manage_project_media===true;}catch{}}
    this.input.disabled=!this.canManage;
    document.getElementById('projectMediaControls').hidden=!this.canManage;
    await this.render();
  }
  async database(){if(this.db)return this.db;this.db=await new Promise((resolve,reject)=>{const r=indexedDB.open('robot-project-media',1);r.onupgradeneeded=()=>r.result.createObjectStore('media',{keyPath:'id'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});return this.db;}
  async local(mode,fn){const db=await this.database();return new Promise((resolve,reject)=>{const tx=db.transaction('media',mode);let result;const req=fn(tx.objectStore('media'));req.onsuccess=()=>result=req.result;tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);});}
  async entries(){if(BRIDGE){const r=await fetch('/api/media',{headers:{Authorization:'Bearer '+AUTH}});if(!r.ok)throw Error(await r.text());return r.json();}return this.local('readonly',s=>s.getAll());}
  async add(files){const status=document.getElementById('mediaStatus');try{
    if(!this.canManage)throw Error(t('إدارة الوسائط متاحة لصاحب المشروع فقط.'));
    for(const file of files){if(!['image/jpeg','image/png','image/webp','video/mp4','video/webm'].includes(file.type))throw Error(t('الملف غير مدعوم'));if(file.size>50*1024*1024)throw Error(t('الحد الأقصى للملف 50 ميجابايت'));
      status.textContent=t('تحميل الوسائط…');
      if(BRIDGE){const body=new FormData();body.append('file',file);const r=await fetch('/api/media',{method:'POST',headers:{Authorization:'Bearer '+AUTH},body});if(!r.ok)throw Error(await r.text());}
      else await this.local('readwrite',s=>s.put({id:crypto.randomUUID(),name:file.name,type:file.type,blob:file,created:Date.now()}));
    }this.input.value='';await this.render();status.textContent=t('حُفظت الوسائط');
  }catch(e){status.textContent=t('تعذّر حفظ الوسائط: ')+e.message;}}
  async remove(id){if(!this.canManage)throw Error(t('إدارة الوسائط متاحة لصاحب المشروع فقط.'));if(!confirm(t('حذف هذه الوسائط؟')))return;if(BRIDGE){const r=await fetch('/api/media/'+encodeURIComponent(id),{method:'DELETE',headers:{Authorization:'Bearer '+AUTH}});if(!r.ok)throw Error(await r.text());}else await this.local('readwrite',s=>s.delete(id));await this.render();}
  async render(){const box=document.getElementById('mediaGallery'),status=document.getElementById('mediaStatus');try{
    const entries=await this.entries();this.urls.forEach(u=>URL.revokeObjectURL(u));this.urls=[];box.replaceChildren();
    for(const entry of entries){const figure=document.createElement('figure'),video=entry.type.startsWith('video/'),el=document.createElement(video?'video':'img');
      if(BRIDGE)el.src='/api/media/'+encodeURIComponent(entry.id)+'?token='+encodeURIComponent(AUTH);else{el.src=URL.createObjectURL(entry.blob);this.urls.push(el.src);}
      if(video){el.controls=true;el.preload='metadata';el.playsInline=true;}else{el.alt=entry.name;el.loading='lazy';}
      const caption=document.createElement('figcaption');caption.textContent=entry.name;caption.dataset.userContent='true';figure.append(el,caption);
      if(this.canManage){const remove=document.createElement('button');remove.textContent=t('حذف');remove.onclick=()=>this.remove(entry.id).catch(e=>status.textContent=e.message);figure.append(remove);}box.append(figure);
    }status.textContent=entries.length?'':t(this.canManage?'أضف صورًا أو فيديو للروبوت الفعلي.':'لم تُضف صور أو فيديو بعد.');
  }catch(e){status.textContent=t('تعذّر حفظ الوسائط: ')+e.message;}}
}
new ProjectMediaStore();
