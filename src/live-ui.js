'use strict';
const LiveDirectory=(()=>{
  let directory, followed, view='discover', area='', previousScroll=0, request=0;
  const current=()=>view==='following'?followed:directory;

  function avatar(room) {
    return room.avatar?`<img src="${esc(image(room.avatar))}" alt="" loading="lazy">`:icon('user');
  }
  function artwork(room) {
    return room.cover?`<img src="${esc(image(room.cover))}" alt="" loading="lazy">`
      :`<span class="live-artwork-placeholder">${room.avatar?avatar(room):icon('live')}</span>`;
  }
  function badge() {
    return '<span class="live-card-badge"><i></i>直播中</span>';
  }
  function card(room) {
    return `<button type="button" class="live-card" data-live-room="${room.id}" aria-label="观看 ${esc(room.title)}">
      <span class="live-card-art">${artwork(room)}${badge()}
        ${room.online?`<span class="live-viewers">${icon('users')}${number(room.online)}</span>`:''}</span>
      <span class="live-card-info"><span class="live-avatar">${avatar(room)}</span>
        <span class="live-card-copy"><strong title="${esc(room.title)}">${esc(room.title)}</strong><small>${esc(room.author)}</small></span>
        ${room.area?`<span class="live-tag">${esc(room.area)}</span>`:''}</span>
    </button>`;
  }
  function spotlight(room) {
    return `<button type="button" class="live-spotlight" data-live-room="${room.id}">
      <span class="live-spotlight-art">${artwork(room)}</span><span class="live-spotlight-copy">${badge()}
        <strong>${esc(room.title)}</strong><small>${esc([room.author,room.area].filter(Boolean).join(' · '))}</small>
        <span class="live-spotlight-watch">${icon('play')}进入直播间</span>
      </span></button>`;
  }
  function render(result) {
    const rooms=result.rooms,discover=view==='discover';
    const groups=discover?[...new Set(rooms.map(room=>room.area).filter(Boolean))]:[];
    if(discover&&area&&!groups.includes(area))area='';
    const featured=discover&&!area&&rooms.length>1?rooms[0]:null;
    const visible=discover&&area?rooms.filter(room=>room.area===area):featured?rooms.slice(1):rooms;
    $('live-featured').innerHTML=featured?spotlight(featured):'';
    $('live-areas').innerHTML=groups.length?['',...groups].map(label=>`<button type="button" data-live-area="${esc(label)}"
      aria-pressed="${area===label}">${esc(label||'全部')}</button>`).join(''):'';
    $('live-list-heading').textContent=discover&&area?area:discover?'正在直播':'关注主播开播中';
    $('live-list-heading').hidden=result.needLogin||!visible.length;
    $('live-total').textContent=visible.length?`${visible.length} 个直播间`:'';
    if(result.needLogin){
      $('live-rooms').innerHTML=empty('登录后查看关注直播','登录 B 站账号，即可查看你关注的主播现在在播什么。','user')+
        '<div class="empty-action"><button type="button" class="primary-button" data-login>登录 B 站</button></div>';
    }else{
      $('live-rooms').innerHTML=visible.length?`<div class="live-grid">${visible.map(card).join('')}</div>`
        :discover?empty('暂时没有直播','可以刷新或打开 B 站直播首页。','live')
          :empty('关注的主播暂未开播','可以刷新查看开播动态，或去发现直播。','live')+
            '<div class="empty-action"><button type="button" class="secondary-button" data-live-view="discover">发现直播</button></div>';
    }
  }
  function renderTabs() {
    for(const button of document.querySelectorAll('[data-live-tab]')){
      button.setAttribute('aria-pressed',String(button.dataset.liveView===view));
    }
  }
  async function load({refresh=false,restore=false}={}) {
    renderTabs();
    const turn=++request, routeTurn=generation, tab=view;
    const active=()=>turn===request&&routeTurn===generation;
    const previous=current();
    const notice=$('live-status'),refreshButton=$('live-refresh');
    if(previous)render(previous);
    if(restore&&previous){
      $('workspace').scrollTop=previousScroll;
      return true;
    }
    notice.hidden=false;notice.textContent=refresh?'正在刷新直播…':'正在加载直播…';
    refreshButton.disabled=true;
    if(!previous){
      $('live-featured').replaceChildren();$('live-areas').replaceChildren();
      $('live-list-heading').hidden=true;$('live-total').textContent='';
      $('live-rooms').innerHTML=skeleton();
    }
    try{
      const result=tab==='following'?await window.bili.api('live-following')
        :{rooms:await window.bili.api('live-directory'),needLogin:false};
      if(!active())return false;
      if(tab==='following')followed=result;else directory=result;
      notice.hidden=true;render(result);
      return true;
    }catch(error){
      if(!active())return false;
      if(previous)notice.textContent=error.message;
      else{
        notice.hidden=true;
        $('live-rooms').innerHTML=empty('暂时无法加载直播',error.message,'live')+
          '<div class="empty-action"><button type="button" class="secondary-button" data-refresh>重新加载</button></div>';
      }
      return false;
    }finally{if(active())refreshButton.disabled=false;}
  }
  function mount({refresh=false,restore=false}={}) {
    if(!refresh){
      $('content').innerHTML=`<section class="live-workspace" aria-labelledby="live-heading">
        <header class="live-masthead"><div class="live-brand"><span>${icon('live')}</span><h1 id="live-heading">B 站直播</h1></div>
          <div class="live-actions"><button type="button" class="subtle-button" data-live-room="">官方首页 ${icon('arrow')}</button>
          <button type="button" class="icon-button" id="live-refresh" data-refresh title="刷新直播" aria-label="刷新直播">${icon('refresh')}</button></div>
        </header>
        <div class="live-tabs" role="group" aria-label="直播列表">
          <button type="button" data-live-tab data-live-view="discover">${icon('live')}发现直播</button>
          <button type="button" data-live-tab data-live-view="following">${icon('heart')}我的关注</button>
        </div>
        <div id="live-featured"></div><div id="live-areas" class="live-areas" aria-label="直播分区"></div>
        <p id="live-status" role="status" hidden></p>
        <div class="live-list-header"><h2 id="live-list-heading" hidden></h2><small id="live-total"></small></div>
        <div id="live-rooms"></div>
      </section>`;
    }
    return load({refresh,restore});
  }
  function open(id) {
    previousScroll=$('workspace').scrollTop;
    const room=current()?.rooms.find(item=>item.id===id);
    return navigate('live-room',{roomId:id,roomTitle:room?.title||'B 站直播首页',roomAuthor:room?.author||''});
  }
  function select(next) {
    if(next===view||!['discover','following'].includes(next))return;
    view=next;$('workspace').scrollTop=0;void load();
  }
  function filter(value) {
    if(!directory||view!=='discover')return;
    area=value;render(directory);
    [...$('live-areas').querySelectorAll('button')].find(button=>button.dataset.liveArea===area)?.focus({preventScroll:true});
  }
  function accountChanged() {
    followed=null;
    if(route.name==='live'&&view==='following')void load();
  }
  return {mount,open,filter,select,accountChanged};
})();
