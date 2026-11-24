'use strict';
const Extensions=(()=>{
  let mode=null, observer, epoch=0, panel=null, editing=null, panelMarkup='', downloads=[];
  let browserState={tabs:[],activeId:null,bookmarks:[]};
  function layout() {
    const slot=$('extension-slot');
    if(!mode||!slot)return;
    const rect=slot.getBoundingClientRect();
    window.bili.command('extension-layout',{mode,x:rect.left,y:rect.top,w:rect.width,h:rect.height,
      visible:!slot.hidden&&!$('settings-dialog').open&&$('account-panel').hidden&&!$('action-dialog').open});
  }
  function leave() {
    if(!mode)return;
    mode=null;panel=null;editing=null;panelMarkup='';epoch++;
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
    $('browser-star').disabled=!active?.url||!!active.error;
    const saved=browserState.bookmarks.some(bookmark=>bookmark.url===active?.url);
    $('browser-star').setAttribute('aria-pressed',String(saved));
    $('browser-star').title=saved?'移除当前页收藏':'收藏当前页';
    $('browser-star').setAttribute('aria-label',$('browser-star').title);
    setTabNotice(active?.error||(!active?.url?'输入网址或搜索关键词':''));
    if(panel==='bookmarks')renderPanel();
  }
  async function browser(action,id,value) {
    const turn=epoch;
    try{
      const result=await window.bili.api('browser-command',{action,id,value});
      if(turn!==epoch)return;
      browserState=result;renderBrowser();return true;
    }catch(error){if(turn===epoch)toast(error.message);}
  }
  const bytes=value=>value>=1048576?`${(value/1048576).toFixed(1)} MB`:`${Math.ceil(value/1024)} KB`;
  const downloadStatus={progressing:'下载中',paused:'已暂停',interrupted:'已中断',completed:'已完成',cancelled:'已取消'};
  const downloadActive=item=>item.state==='progressing'||item.state==='paused'||item.canResume;
  const downloadButton=(item,action,label)=>`<button type="button" class="subtle-button" data-download-action="${action}" data-download-id="${esc(item.id)}">${label}</button>`;
  function renderDownloads() {
    if(mode!=='browser')return;
    const active=downloads.filter(downloadActive).length;
    const badge=$('browser-download-count');
    badge.hidden=!active;badge.textContent=active;
    if(panel==='downloads')renderPanel();
  }
  function downloadRow(item) {
    const working=downloadActive(item),{received,total}=item;
    const size=total>0?`${bytes(received)} / ${bytes(total)}`:bytes(received);
    const progress=item.state==='progressing'||item.state==='paused'||item.canResume;
    return `<li class="browser-library-row"><strong title="${esc(item.name)}">${esc(item.name)}</strong>
      <small>${downloadStatus[item.state]||'已中断'} · ${size}</small>
      ${progress?`<progress aria-label="${esc(item.name)} 下载进度" ${total>0?`max="${total}" value="${received}"`:''}></progress>`:''}
      <div class="browser-library-actions">
        ${item.state==='progressing'?downloadButton(item,'pause','暂停'):''}
        ${item.canResume&&item.state!=='progressing'?downloadButton(item,'resume','继续'):''}
        ${working?downloadButton(item,'cancel','取消'):downloadButton(item,'remove','移除记录')}
        ${item.state==='completed'&&item.hasFile?downloadButton(item,'reveal','显示文件'):''}
      </div></li>`;
  }
  function bookmarkRow(item) {
    const id=esc(item.id);
    if(editing===item.id)return `<li class="browser-library-row"><form id="browser-bookmark-edit" data-id="${id}">
      <input aria-label="收藏名称" name="title" value="${esc(item.title)}" maxlength="160" required>
      <div class="browser-library-actions"><button class="subtle-button" type="submit">保存</button><button class="subtle-button" type="button" data-bookmark-action="cancel-edit">取消</button></div></form></li>`;
    return `<li class="browser-library-row"><button type="button" class="browser-bookmark-name" data-bookmark-action="open-bookmark" data-id="${id}" title="${esc(item.url)}">${esc(item.title)}</button>
      <small title="${esc(item.url)}">${esc(item.url)}</small><div class="browser-library-actions">
        <button type="button" class="subtle-button" data-bookmark-action="edit" data-id="${id}">重命名</button>
        <button type="button" class="subtle-button" data-bookmark-action="remove-bookmark" data-id="${id}">移除</button></div></li>`;
  }
  function renderPanel() {
    if(!panel)return;
    const list=$('browser-library-list'),current=document.activeElement;
    const markup=panel==='bookmarks'?browserState.bookmarks.map(bookmarkRow).join('')||'<li class="browser-library-empty">点击地址栏旁的星标收藏网页。</li>':
      downloads.map(downloadRow).join('')||'<li class="browser-library-empty">暂无下载记录</li>';
    if(markup===panelMarkup)return;
    panelMarkup=markup;
    list.innerHTML=markup;
    if(current?.dataset.downloadAction){
      Array.from(list.querySelectorAll('button')).find(button=>button.dataset.downloadId===current.dataset.downloadId&&button.dataset.downloadAction===current.dataset.downloadAction)?.focus({preventScroll:true});
    }
  }
  function setPanel(next) {
    panel=panel===next?null:next;editing=null;panelMarkup='';
    $('browser-library').hidden=!panel;
    $('browser-bookmarks').setAttribute('aria-expanded',String(panel==='bookmarks'));
    $('browser-downloads').setAttribute('aria-expanded',String(panel==='downloads'));
    if(panel){
      $('browser-library-title').textContent=panel==='bookmarks'?'收藏夹':'下载';
      $('browser-library-list').scrollTop=0;
      renderPanel();$('browser-library-close').focus();
    }
    layout();
  }
  function download(action,id) {
    return window.bili.api('browser-download',{action,id}).catch(error=>toast(error.message));
  }
  function browserMarkup() {
    return `<section class="extension-frame" aria-label="内置浏览器">
      <div class="browser-tabs-row"><div id="browser-tabs" class="browser-tabs"></div><button id="browser-new" class="icon-button" type="button" aria-label="新建标签页" title="新建标签页">${icon('plus')}</button></div>
      <form id="browser-form" class="browser-toolbar">
      <button type="button" class="icon-button" id="browser-back" aria-label="网页后退" title="网页后退">${icon('back')}</button>
      <button type="button" class="icon-button" id="browser-forward" aria-label="网页前进" title="网页前进">${icon('arrow')}</button>
      <button type="button" class="icon-button" id="browser-refresh" aria-label="刷新网页" title="刷新网页">${icon('refresh')}</button>
      <input id="browser-address" aria-label="网页地址或搜索关键词" placeholder="输入网址或搜索关键词" maxlength="2048" autocomplete="off" spellcheck="false">
      <button type="button" class="icon-button" id="browser-star" aria-label="收藏当前页" aria-pressed="false">${icon('star')}</button>
      <button type="button" class="icon-button" id="browser-bookmarks" aria-label="收藏夹" title="收藏夹" aria-expanded="false" aria-controls="browser-library">${icon('bookmarks')}</button>
      <button type="button" class="icon-button" id="browser-downloads" aria-label="下载" title="下载" aria-expanded="false" aria-controls="browser-library">${icon('download')}<span id="browser-download-count" hidden></span></button>
      <button type="submit" class="subtle-button">前往</button><span id="browser-status" role="status"></span>
      </form><div class="extension-body"><div class="extension-page"><div id="extension-slot"></div><div id="extension-notice" class="extension-notice" role="status"></div></div>
      <aside id="browser-library" hidden aria-labelledby="browser-library-title"><header><h2 id="browser-library-title"></h2><button type="button" id="browser-library-close" class="icon-button" aria-label="关闭面板">${icon('close')}</button></header><ul id="browser-library-list"></ul></aside></div></section>`;
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
    $('browser-star').onclick=()=>browser('bookmark');
    for(const name of ['bookmarks','downloads'])$('browser-'+name).onclick=()=>setPanel(name);
    function closePanel() {const button=$('browser-'+panel);setPanel(null);button?.focus();}
    $('browser-library-close').onclick=closePanel;
    $('browser-library').onkeydown=event=>{if(event.key==='Escape'){event.stopPropagation();closePanel();}};
    $('browser-library-list').onclick=event=>{
      const button=event.target.closest('button');
      if(!button)return;
      const {bookmarkAction,id,downloadAction,downloadId}=button.dataset;
      if(downloadAction)download(downloadAction,downloadId);
      else if(bookmarkAction==='edit'){editing=id;renderPanel();$('browser-bookmark-edit').elements.title.select();}
      else if(bookmarkAction==='cancel-edit'){editing=null;renderPanel();}
      else if(bookmarkAction){
        if(bookmarkAction==='open-bookmark')closePanel();
        browser(bookmarkAction,id);
      }
    };
    $('browser-library-list').onsubmit=async event=>{
      event.preventDefault();
      const form=event.target,id=form.dataset.id,title=form.elements.title.value.trim();
      if(title&&await browser('rename-bookmark',id,title)&&editing===id){editing=null;renderPanel();}
    };
    renderBrowser();renderDownloads();browser('state');download('list');
  }

  function mountPage(kind,markup) {
    mode=kind;
    $('workspace').classList.add('embedded-workspace');
    $('content').innerHTML=markup;
    observer=new ResizeObserver(layout);
    observer.observe($('extension-slot'));
    layout();
  }
  function mount() {
    mountPage('browser',browserMarkup());
    bindBrowser();
    return true;
  }
  async function refreshLive() {
    const turn=epoch;
    setTabNotice('正在打开直播间…');
    try {await window.bili.api('live-room',{id:route.roomId});}
    catch(error){if(turn===epoch&&mode==='live')setTabNotice(error.message);}
  }
  function mountLive() {
    mountPage('live',`<section class="extension-frame live-room-frame" aria-label="B 站直播">
      <div class="live-room-toolbar"><button type="button" class="icon-button live-room-back" aria-label="返回直播列表" title="返回直播列表" data-back>${icon('back')}</button>
        <div class="live-room-copy"><strong title="${esc(route.roomTitle)}">${esc(route.roomTitle)}</strong>
          ${route.roomAuthor?`<small>${esc(route.roomAuthor)}</small>`:''}</div>
        <button type="button" class="icon-button" data-refresh aria-label="刷新直播间" title="刷新直播间">${icon('refresh')}</button></div>
      <div class="extension-body"><div class="extension-page"><div id="extension-slot" hidden></div>
        <div id="extension-notice" class="extension-notice" role="status"></div></div></div></section>`);
    return refreshLive();
  }
  function event(type,value) {
    if(type==='browser-state'){browserState=value;renderBrowser();return true;}
    if(type==='browser-downloads'){downloads=value;renderDownloads();return true;}
    if(type==='browser-library-error'){toast(value);return true;}
    if(type==='live-state'){
      if(mode==='live'&&route.roomId===value.id)setTabNotice(value.error||(value.loading?'正在打开直播间…':''));
      return true;
    }
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
  return {mount,mountLive,leave,event,refresh:()=>browser('refresh'),refreshLive};
})();
