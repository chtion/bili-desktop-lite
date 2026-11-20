'use strict';
const Extensions=(()=>{
  let mode=null, observer, epoch=0, browserState={tabs:[],activeId:null};
  function layout() {
    const slot=$('extension-slot');
    if(!mode||!slot)return;
    const rect=slot.getBoundingClientRect();
    window.bili.command('extension-layout',{mode,x:rect.left,y:rect.top,w:rect.width,h:rect.height,
      visible:!slot.hidden&&!$('settings-dialog').open&&$('account-panel').hidden&&!$('action-dialog').open});
  }
  function leave() {
    if(!mode)return;
    mode=null;epoch++;
    observer?.disconnect();
    $('workspace').classList.remove('embedded-workspace');
    window.bili.command('extension-layout',null);
  }
  function setTabNotice(message) {
    $('extension-notice').textContent=message;
    $('extension-notice').hidden=!message;
    $('extension-slot').hidden=!!message;
    layout();
  }
  function renderBrowser() {
    if(mode!=='browser')return;
    const {tabs,activeId}=browserState,active=tabs.find(tab=>tab.id===activeId);
    $('browser-tabs').innerHTML=tabs.map(tab=>`<div class="browser-tab ${tab.id===activeId?'active':''}"><button type="button" data-tab-pick="${tab.id}" aria-pressed="${tab.id===activeId}" title="${esc(tab.title)}">${esc(tab.title)}</button><button type="button" class="icon-button" data-tab-close="${tab.id}" aria-label="关闭 ${esc(tab.title)}">${icon('close')}</button></div>`).join('');
    $('browser-new').disabled=tabs.length>=12;
    $('browser-back').disabled=!active?.canBack;
    $('browser-forward').disabled=!active?.canForward;
    $('browser-refresh').disabled=!active?.url;
    $('browser-status').textContent=active?.loading?'正在加载…':'';
    if(document.activeElement!==$('browser-address'))$('browser-address').value=active?.url||'';
    setTabNotice(active?.error||(!active?.url?'输入网址或搜索关键词':''));
  }
  async function browser(action,id,value) {
    const turn=epoch;
    try{
      const result=await window.bili.api('browser-command',{action,id,value});
      if(turn!==epoch)return;
      browserState=result;renderBrowser();
    }catch(error){if(turn===epoch)toast(error.message);}
  }
  function browserMarkup() {
    return `<section class="extension-frame" aria-label="内置浏览器">
      <div class="browser-tabs-row"><div id="browser-tabs" class="browser-tabs"></div><button id="browser-new" class="icon-button" type="button" aria-label="新建标签页" title="新建标签页">${icon('plus')}</button></div>
      <form id="browser-form" class="browser-toolbar">
      <button type="button" class="icon-button" id="browser-back" aria-label="网页后退" title="网页后退">${icon('back')}</button>
      <button type="button" class="icon-button" id="browser-forward" aria-label="网页前进" title="网页前进">${icon('arrow')}</button>
      <button type="button" class="icon-button" id="browser-refresh" aria-label="刷新网页" title="刷新网页">${icon('refresh')}</button>
      <input id="browser-address" aria-label="网页地址或搜索关键词" placeholder="输入网址或搜索关键词" maxlength="2048" autocomplete="off" spellcheck="false">
      <button type="submit" class="subtle-button">前往</button><span id="browser-status" role="status"></span>
      </form><div class="extension-page"><div id="extension-slot"></div><div id="extension-notice" class="extension-notice" role="status"></div></div></section>`;
  }
  function focusAddress() {$('browser-address').focus();$('browser-address').select();}
  function bindBrowser() {
    $('browser-form').onsubmit=event=>{event.preventDefault();const value=$('browser-address').value;$('browser-address').blur();browser('go',null,value);};
    $('browser-tabs').onclick=event=>{
      const button=event.target.closest('button');
      if(button?.dataset.tabPick)browser('select',Number(button.dataset.tabPick));
      if(button?.dataset.tabClose)browser('close',Number(button.dataset.tabClose));
    };
    $('browser-new').onclick=()=>{ $('browser-address').value='';browser('new');focusAddress(); };
    for(const action of ['back','forward','refresh'])$('browser-'+action).onclick=()=>browser(action);
    renderBrowser();browser('state');
  }

  function mount() {
    mode='browser';
    $('workspace').classList.add('embedded-workspace');
    $('content').innerHTML=browserMarkup();
    observer=new ResizeObserver(layout);
    observer.observe($('extension-slot'));
    layout();
    bindBrowser();
    return true;
  }
  function event(type,value) {
    if(type==='browser-state'){browserState=value;renderBrowser();return true;}
    if(mode==='browser'&&['focus-address','focus-search'].includes(type)){focusAddress();return true;}
    if(type==='resize')layout();
    return false;
  }
  const overlays=new MutationObserver(layout);
  document.addEventListener('DOMContentLoaded',()=>{
    overlays.observe($('account-panel'),{attributes:true,attributeFilter:['hidden']});
    for(const id of ['settings-dialog','action-dialog'])overlays.observe($(id),{attributes:true,attributeFilter:['open']});
    $('workspace').addEventListener('transitionend',layout);
    $('sidebar-toggle').addEventListener('click',()=>{
      if(!mode)return;
      const deadline=performance.now()+330;
      const frame=()=>{layout();if(mode&&performance.now()<deadline)requestAnimationFrame(frame);};
      requestAnimationFrame(frame);
    });
  });
  return {mount,leave,event,refresh:()=>browser('refresh')};
})();
