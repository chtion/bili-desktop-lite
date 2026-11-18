'use strict';
let appPreferences={webFullscreen:false,rightPanel:true,bossPause:true,bossKey:'Control+Alt+B',pinKey:'Control+Alt+P'};
let preferencesReady, bossIsHidden=false, settingsFocus;
const keyLabel=key=>key.replaceAll('Control','Ctrl');
function updatePreferences(data) {
  appPreferences=data.values;
  $('pin-window').title=`置顶播放窗口${appPreferences.pinKey?' · '+keyLabel(appPreferences.pinKey):''}`;
}
function populateSettings() {
  $('pref-web-fullscreen').checked=appPreferences.webFullscreen;
  $('pref-right-panel').checked=appPreferences.rightPanel;
  $('pref-boss-pause').checked=appPreferences.bossPause;
  for(const input of document.querySelectorAll('[data-shortcut]')) {
    input.dataset.value=appPreferences[input.dataset.shortcut];input.value=keyLabel(input.dataset.value);
  }
}
function settingsError(message) {$('settings-error').hidden=!message;$('settings-error').textContent=message;}
async function openSettings() {
  settingsFocus=document.activeElement;closeAccount(false);
  try {await preferencesReady;const data=await window.bili.api('settings');updatePreferences(data);populateSettings();settingsError(data.shortcutErrors.join(' '));}
  catch(e){populateSettings();settingsError(e.message);}
  if(!$('settings-dialog').open)$('settings-dialog').showModal();
  updateBackButton();$('close-settings').focus();
}
function closeSettings() {
  if(!$('settings-dialog').open)return;
  document.activeElement?.blur();window.bili.command('shortcut-capture',false);
  $('settings-dialog').close();updateBackButton();
  if(settingsFocus?.isConnected)settingsFocus.focus();
}
function initSettings() {
  preferencesReady=window.bili.api('settings').then(data=>{updatePreferences(data);return data;}).catch(e=>{toast(e.message);return null;});
  $('settings-button').addEventListener('click',openSettings);
  $('close-settings').addEventListener('click',closeSettings);
  $('settings-dialog').addEventListener('cancel',event=>{event.preventDefault();closeSettings();});
  $('settings-dialog').addEventListener('click',event=>{if(event.target===$('settings-dialog')){const r=event.target.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)closeSettings();}});
  $('settings-form').addEventListener('submit',async event=>{
    event.preventDefault();document.activeElement?.blur();window.bili.command('shortcut-capture',false);
    $('save-settings').disabled=true;settingsError('');
    try {
      const data=await window.bili.api('save-settings',{webFullscreen:$('pref-web-fullscreen').checked,rightPanel:$('pref-right-panel').checked,bossPause:$('pref-boss-pause').checked,bossKey:$('pref-boss-key').dataset.value,pinKey:$('pref-pin-key').dataset.value});
      updatePreferences(data);closeSettings();toast('设置已保存，默认布局将在下次进入视频时应用');
    }catch(e){settingsError(e.message);}finally{$('save-settings').disabled=false;}
  });
  $('reset-settings').addEventListener('click',()=>{
    $('pref-web-fullscreen').checked=false;$('pref-right-panel').checked=true;$('pref-boss-pause').checked=true;
    for(const [id,key] of [['pref-boss-key','Control+Alt+B'],['pref-pin-key','Control+Alt+P']]){$(id).dataset.value=key;$(id).value=keyLabel(key);}settingsError('');
  });
  for(const input of document.querySelectorAll('[data-shortcut]')) {
    input.addEventListener('focus',()=>{input.value='请按下快捷键…';window.bili.command('shortcut-capture',true);});
    input.addEventListener('blur',()=>{input.value=keyLabel(input.dataset.value||'');window.bili.command('shortcut-capture',false);});
    input.addEventListener('keydown',event=>{
      if(event.key==='Tab')return;
      event.preventDefault();event.stopPropagation();
      if(event.key==='Escape'){input.blur();return;}
      if(['Control','Alt','Shift','Meta'].includes(event.key))return;
      const key=event.code.replace(/^Key|^Digit/,'');
      if(event.metaKey || !/^(?:[A-Z0-9]|F(?:[1-9]|1\d|2[0-4]))$/.test(key)){settingsError('请使用字母、数字或功能键，不使用 Windows 键。');return;}
      if(!event.ctrlKey && !event.altKey && !/^F\d+$/.test(key)){settingsError('字母和数字需要搭配 Ctrl 或 Alt。');return;}
      input.dataset.value=[event.ctrlKey?'Control':'',event.altKey?'Alt':'',event.shiftKey?'Shift':'',key].filter(Boolean).join('+');
      settingsError('');input.blur();
    });
  }
  document.querySelectorAll('[data-clear-shortcut]').forEach(b=>b.addEventListener('click',()=>{const input=$(b.dataset.clearShortcut);input.dataset.value='';input.value='';}));
  $('pin-window').addEventListener('click',()=>window.bili.command('pin'));
  window.addEventListener('focus',()=>{if($('settings-dialog').open && document.activeElement?.dataset.shortcut)window.bili.command('shortcut-capture',true);});
}
