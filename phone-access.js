/* One-click phone sharing; the LAN listener is managed by the local app. */
class PhoneAccessController {
  constructor(){
    this.dialog=document.getElementById('phoneDialog');this.state={enabled:false,urls:[]};
    document.getElementById('phoneAccess').addEventListener('click',()=>this.open());
    document.getElementById('closePhoneDialog').addEventListener('click',()=>this.dialog.close());
    document.getElementById('enablePhone').addEventListener('click',()=>this.toggle(true));
    document.getElementById('disablePhone').addEventListener('click',()=>this.toggle(false));
    document.addEventListener('studio:language',()=>{I18n.apply(this.dialog);this.render(this.state);});
    I18n.apply(this.dialog);
    if(BRIDGE)this.refresh();
  }
  async api(enabled){const response=await fetch('/api/phone',{method:enabled===undefined?'GET':'POST',headers:{Authorization:'Bearer '+AUTH,'Content-Type':'application/json'},...(enabled!==undefined?{body:JSON.stringify({enabled})}:{})});if(!response.ok)throw Error(t('تعذّر تفعيل الهاتف؛ افحص اتصال الشبكة.'));return response.json();}
  async refresh(){try{this.render(await this.api());}catch{}}
  async open(){
    this.dialog.showModal();
    if(!BRIDGE){document.getElementById('phoneSharingStatus').textContent=t('افتح التطبيق عبر START_WINDOWS.bat لاستخدام الهاتف. لا تحتاج تشغيل خادم إضافي.');document.getElementById('enablePhone').hidden=true;return;}
    // Opening the explicit Phone action is authorization to enable sharing.
    await this.toggle(true);
  }
  async toggle(enabled){
    const buttons=[document.getElementById('enablePhone'),document.getElementById('disablePhone')];buttons.forEach(b=>b.disabled=true);
    document.getElementById('phoneSharingStatus').textContent=t('جارٍ إعداد اتصال الهاتف…');
    try{this.render(await this.api(enabled));}
    catch(e){document.getElementById('phoneSharingStatus').textContent=e.message;}
    finally{buttons.forEach(b=>b.disabled=false);}
  }
  render(state){
    this.state=state;const enabled=!!state.enabled,urls=state.urls||[];
    document.getElementById('phoneAccess').classList.toggle('phone-access-on',enabled);
    document.getElementById('enablePhone').hidden=enabled;document.getElementById('disablePhone').hidden=!enabled;
    document.getElementById('phoneShareDetails').hidden=!enabled||!urls.length;
    document.getElementById('phoneSharingStatus').textContent=t(enabled?(urls.length?'اتصال الهاتف مفعّل. امسح الرمز لفتح الموقع على الهاتف.':'المشاركة مفعّلة، لكن لا يوجد عنوان شبكة محلية. اتصل بشبكة Wi-Fi.'): 'مشاركة الهاتف متوقفة.');
    const box=document.getElementById('phoneLinks');box.replaceChildren();
    for(const url of urls){const a=document.createElement('a');a.href=url;a.textContent=url.split('?')[0];a.className='phone-url';a.target='_blank';a.rel='noopener';box.append(a);}
    document.getElementById('phonePin').textContent=state.pin||'';
    const image=document.getElementById('phoneQr');if(enabled&&urls.length)image.src='/api/qr?token='+encodeURIComponent(AUTH)+'&phone='+state.port;
  }
}
new PhoneAccessController();
