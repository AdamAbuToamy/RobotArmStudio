/* Presentation-only state. Motor commands remain in controller.js / studio.js. */
class StudioInterface {
  constructor(){
    this.bindJogModes();this.bindSettingsTabs();
    document.getElementById('previewKindBadge').hidden=window.ROBOT_MODEL_KIND!=='schematic';
    document.getElementById('languageSelect').value=I18n.language;
    document.getElementById('languageSelect').addEventListener('change',e=>{
      if(typeof usable==='function'&&usable()&&(jog||heldKeys.size))stopNow(t('توقفت الحركة اليدوية'),true);
      I18n.setLanguage(e.target.value);
      NAMES.splice(0,NAMES.length,...I18n.axisNames());
      for(const id of ['keyLR','visualJoint','limitJoint']){const e=document.getElementById(id),v=e.value;axisOptions(e);if(id==='limitJoint')e.remove(5);e.value=v;}
      for(let i=0;i<6;i++){const e=document.getElementById('vertical'+i),v=e.value;axisOptions(e,true);e.value=v;}
      window.CartesianStudio?.refreshLanguage?.();render();renderPoses();renderLibrary();renderMapping();
      I18n.apply(document);document.dispatchEvent(new Event('studio:language'));
    });
    document.querySelectorAll('.nav-item').forEach(e=>e.title=t(e.querySelector('b').dataset.i18n||e.querySelector('b').textContent));
    document.addEventListener('studio:page',()=>{document.querySelector('[data-page="library"]').classList.toggle('selected',page==='library'||page==='editor');});
    I18n.apply(document);
  }
  bindJogModes(){document.querySelectorAll('[data-jog-mode]').forEach(b=>b.addEventListener('click',()=>{
    if(typeof usable==='function'&&usable()&&(jog||heldKeys.size))stopNow(t('توقفت الحركة اليدوية'),true);
    document.querySelectorAll('[data-jog-mode]').forEach(x=>x.classList.toggle('selected',x===b));
    document.getElementById('singleJog').hidden=b.dataset.jogMode!=='joint';document.getElementById('dualJog').hidden=b.dataset.jogMode!=='dual';
  }));}
  bindSettingsTabs(){document.querySelectorAll('[data-settings-tab]').forEach(b=>b.addEventListener('click',()=>{
    document.querySelectorAll('[data-settings-tab]').forEach(x=>x.classList.toggle('selected',x===b));
    document.querySelectorAll('[data-settings-content]').forEach(x=>x.hidden=x.dataset.settingsContent!==b.dataset.settingsTab);
  }));}
}
new StudioInterface();
