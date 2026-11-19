'use strict';
const Extensions=(()=>{
  let mode=null, observer, epoch=0, browserState={tabs:[],activeId:null};
  let red={section:'home'}, redError='', busy=false;
  let recent, favorites;

  function layout() {
    const slot=$('extension-slot');
    if(!mode||!slot)return;
    const rect=slot.getBoundingClientRect();
    window.bili.command('extension-layout',{mode,x:rect.left,y:rect.top,w:rect.width,h:rect.height,
      visible:!slot.hidden&&!$('settings-dialog').open&&$('account-panel').hidden&&!$('action-dialog').open});
  }
  function leave() {
    if(!mode)return;
    mode=null;epoch++;busy=false;
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

  function rememberRed() {
    if(!red.isPlayer||!red.title)return;
    const title=red.title.slice(0,160);
    recent=[{url:red.url,title},...recent.filter(item=>item.url!==red.url)].slice(0,50);
    storage.write('hongguo-recent',recent);
  }
  function redList(items) {
    return items.length?items.map((item,index)=>`<button class="subtle-button" data-red-item="${index}">${icon('play')} ${esc(item.title)}</button>`).join(''):'<p class="muted">暂无记录</p>';
  }
  function renderRed() {
    if(mode!=='hongguo')return;
    const {section,isPlayer,index,total,canBack,url}=red;
    document.querySelectorAll('[data-red-section]').forEach(button=>{
      const selected=button.dataset.redSection===section||(section==='saved'&&button.dataset.redSection==='mine');
      button.classList.toggle('active',selected);button.setAttribute('aria-pressed',String(selected));
    });
    const mine=$('red-mine');
    mine.hidden=section!=='mine';
    $('red-categories').hidden=section!=='category';
    $('red-swipe').hidden=section!=='recommended';
    $('red-prev').disabled=busy||!total||index===0;
    $('red-next').disabled=busy||!total||index>=total-1;
    $('red-position').textContent=total?`${index+1} / ${total}`:'';
    $('red-back').disabled=!canBack;
    $('red-refresh').hidden=section==='mine';
    $('red-save').hidden=!isPlayer;
    const saved=favorites.some(item=>item.url===url);
    $('red-save').setAttribute('aria-pressed',String(saved));
    $('red-save').title=saved?'取消收藏':'收藏本集';
    $('red-save').setAttribute('aria-label',$('red-save').title);
    $('red-save').classList.toggle('selected',saved);
    if(section==='mine'){
      mine.innerHTML=`<div><h2>本机收藏</h2><div class="red-list" data-red-list="favorites">${redList(favorites)}</div></div>
        <div><h2>最近打开</h2><div class="red-list" data-red-list="recent">${redList(recent)}</div></div>`;
      setTabNotice('');$('extension-slot').hidden=true;layout();return;
    }
    setTabNotice(redError||red.error||(url?'':'正在连接红果官网…'));
  }
  async function hongguo(action,value) {
    const turn=epoch;
    if(action==='step'&&busy)return;
    redError='';busy=action==='step';
    renderRed();
    try{
      const result=await window.bili.api('hongguo-command',{action,value});
      if(turn!==epoch)return;
      red=result;rememberRed();
    }catch(error){if(turn===epoch)redError=error.message;}
    finally{if(turn===epoch){busy=false;renderRed();}}
  }
  function redMarkup() {
    return `<section class="extension-frame hongguo-frame" aria-label="红果短剧">
      <div class="red-toolbar"><strong>${icon('film')} 红果短剧</strong><div class="red-nav" aria-label="红果导航">
      ${[['home','首页'],['category','分类'],['recommended','推荐'],['mine','我的']].map(([section,label])=>`<button type="button" data-red-section="${section}" aria-pressed="false">${label}</button>`).join('')}
      </div><div class="red-tools">
      <button type="button" class="icon-button" id="red-back" aria-label="短剧网页后退" title="短剧网页后退" disabled>${icon('back')}</button>
      <button type="button" class="icon-button" id="red-refresh" aria-label="刷新红果" title="刷新红果">${icon('refresh')}</button>
      <button type="button" class="icon-button" id="red-save" aria-label="收藏本集" title="收藏本集" hidden>${icon('heart')}</button>
      </div></div>
      <div id="red-categories" class="red-subbar" hidden>${[['real-drama','真人剧'],['comic-drama','漫剧'],['ai-drama','AI 剧'],['comic','漫画']].map(([key,label])=>`<button type="button" class="subtle-button" data-red-category="${key}">${label}</button>`).join('')}</div>
      <div id="red-swipe" class="red-subbar" hidden><span>官网推荐</span><button type="button" class="subtle-button" id="red-prev">${icon('previous')}上一部</button><span id="red-position"></span><button type="button" class="subtle-button" id="red-next">下一部${icon('next')}</button></div>
      <div class="extension-page"><div id="red-mine" class="red-mine" hidden></div><div id="extension-slot"></div><div id="extension-notice" class="extension-notice" role="status"></div></div></section>`;
  }
  function bindRed() {
    recent=storage.read('hongguo-recent',[]);
    favorites=storage.read('hongguo-favorites',[]);
    document.querySelector('.hongguo-frame').onclick=event=>{
      const button=event.target.closest('button');
      if(!button)return;
      if(button.dataset.redSection)hongguo('section',button.dataset.redSection);
      if(button.dataset.redCategory)hongguo('category',button.dataset.redCategory);
      if(button.dataset.redItem!==undefined){
        const list=button.closest('[data-red-list]').dataset.redList==='recent'?recent:favorites;
        hongguo('open',list[Number(button.dataset.redItem)]?.url);
      }
    };
    $('red-prev').onclick=()=>hongguo('step',-1);
    $('red-next').onclick=()=>hongguo('step',1);
    $('red-back').onclick=()=>hongguo('back');
    $('red-refresh').onclick=()=>hongguo('refresh');
    $('red-save').onclick=()=>{
      if(!red.isPlayer)return;
      const index=favorites.findIndex(item=>item.url===red.url);
      if(index>=0)favorites.splice(index,1);
      else favorites.unshift({url:red.url,title:red.title||'红果短剧'});
      storage.write('hongguo-favorites',favorites.slice(0,200));renderRed();
    };
    hongguo('section',red.section==='saved'?'mine':red.section);
  }
  function mount(name) {
    mode=name;
    $('workspace').classList.add('embedded-workspace');
    $('content').innerHTML=name==='browser'?browserMarkup():redMarkup();
    observer=new ResizeObserver(layout);
    observer.observe($('extension-slot'));
    layout();
    if(name==='browser')bindBrowser();else bindRed();
    return true;
  }
  function event(type,value) {
    if(type==='browser-state'){browserState=value;renderBrowser();return true;}
    if(type==='hongguo-state'){red=value;if(mode==='hongguo'){rememberRed();renderRed();}return true;}
    if(type==='extension-error'){if(mode)toast(value);return true;}
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
  return {mount,leave,event,refresh:()=>mode==='browser'?browser('refresh'):hongguo('refresh')};
})();
