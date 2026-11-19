'use strict';
let appPreferences={webFullscreen:false,rightPanel:true,feedAutoNext:true,detailAutoNext:true,historySync:true,bossPause:true,bossKey:'Control+Alt+B',pinKey:'Control+Alt+P'};
let preferencesReady, bossIsHidden=false, settingsFocus;
const keyLabel=key=>key.replaceAll('Control','Ctrl');
function updatePreferences(data) {
  appPreferences=data.values;
  updatePinState({pinned:$('pin-window').getAttribute('aria-pressed')==='true'});
}
function updatePinState({pinned}) {
  const label=pinned?'取消置顶播放窗口':'置顶播放窗口';
  for(const button of [$('pin-window'),$('pin-playback')].filter(Boolean)) {
    button.setAttribute('aria-pressed',String(pinned));
    button.setAttribute('aria-label',label);
    button.title=label+(appPreferences.pinKey?' · '+keyLabel(appPreferences.pinKey):'');
  }
  if($('pin-playback'))$('pin-playback').innerHTML=icon('pin')+(pinned?'已置顶':'置顶');
}
function populateSettings() {
  $('pref-web-fullscreen').checked=appPreferences.webFullscreen;
  $('pref-right-panel').checked=appPreferences.rightPanel;
  $('pref-feed-next').checked=appPreferences.feedAutoNext;
  $('pref-detail-next').checked=appPreferences.detailAutoNext;
  $('pref-boss-pause').checked=appPreferences.bossPause;
  $('pref-history-sync').checked=appPreferences.historySync;
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
      const data=await window.bili.api('save-settings',{webFullscreen:$('pref-web-fullscreen').checked,rightPanel:$('pref-right-panel').checked,feedAutoNext:$('pref-feed-next').checked,detailAutoNext:$('pref-detail-next').checked,historySync:$('pref-history-sync').checked,bossPause:$('pref-boss-pause').checked,bossKey:$('pref-boss-key').dataset.value,pinKey:$('pref-pin-key').dataset.value});
      updatePreferences(data);closeSettings();toast('设置已保存，默认布局将在下次进入视频时应用');
    }catch(e){settingsError(e.message);}finally{$('save-settings').disabled=false;}
  });
  $('reset-settings').addEventListener('click',()=>{
    $('pref-web-fullscreen').checked=false;$('pref-right-panel').checked=true;$('pref-boss-pause').checked=true;
    $('pref-history-sync').checked=true;
    $('pref-feed-next').checked=true;$('pref-detail-next').checked=true;
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
  initUpdates();
}
function initUpdates() {
  const ids=['check-update','update-folder','install-update'];
  const lock=locked=>ids.forEach(id=>{$(id).disabled=locked;});
  const status=message=>{$('update-status').textContent=message;};
  const progress=$('update-progress'),cancel=$('cancel-update'),notes=$('update-notes');
  const size=bytes=>`${(bytes/1048576).toFixed(1)} MB`;
  window.bili.api('update-info').then(({current})=>{$('current-version').textContent=`v${current}`;}).catch(()=>{});
  async function check(local) {
    lock(true);$('install-update').hidden=true;notes.hidden=true;notes.open=false;status('正在检查更新…');
    try {
      const data=await window.bili.api('check-update',{local});
      status(data.offer?`${data.message} · ${data.offer.source} · ${size(data.offer.size)}`:data.message);
      notes.querySelector('p').textContent=data.offer?.notes||'';
      notes.hidden=!data.offer?.notes;
      $('install-update').hidden=!data.offer;
    } catch(error){status(error.message+' 可从发布文件夹检查。');}
    finally{lock(false);}
  }
  $('check-update').addEventListener('click',()=>check(false));
  $('update-folder').addEventListener('click',()=>check(true));
  window.bili.onEvent((type,data)=>{
    if(type!=='update-progress')return;
    const {phase,bytes,total,version}=data;
    const downloading=phase==='downloading';
    cancel.hidden=!downloading;
    if(downloading){
      const percent=Math.min(100,Math.floor(100*bytes/total));
      progress.value=percent;
      status(`正在下载 v${version} · ${percent}% · ${size(bytes)} / ${size(total)}`);
    }else{
      progress.removeAttribute('value');
      status({preparing:'正在准备更新…',copying:'正在复制发布包…',verifying:'正在核对大小与 SHA-256…',restarting:'校验通过，正在重启…'}[phase]||'正在更新…');
    }
    progress.hidden=false;
  });
  cancel.addEventListener('click',()=>{cancel.disabled=true;window.bili.api('cancel-update').catch(error=>status(error.message));});
  $('install-update').addEventListener('click',async()=>{
    lock(true);cancel.disabled=false;status('正在准备更新…');
    try {NativePlayer.flushProgress();await window.bili.api('install-update');}
    catch(error){status(error.message);progress.hidden=true;cancel.hidden=true;lock(false);}
  });
}
