'use strict';
const StreamFeed = (() => {
  let items=[], page=0, index=0, more=true, loading=false, source='guest';
  let view=0, note='';
  const labels={account:'账号推荐',guest:'游客推荐',popular:'热门备用'};

  function reset() {
    view++;items=[];page=0;index=0;more=true;loading=false;note='';source='guest';
  }
  function active(turn) {return route.name==='swipe' && turn===view;}
  function leave() {view++;loading=false;}
  async function loadMore(turn) {
    for(let attempt=0;attempt<3 && more;attempt++){
      const result=await window.bili.api('feed',{page:page+1,category:0});
      if(!active(turn))return;
      const seen=new Set(items.map(item=>item.bvid));
      const fresh=result.items.filter(item=>{
        if(seen.has(item.bvid))return false;
        seen.add(item.bvid);return true;
      });
      page++;more=result.more;note=result.note;source=result.source;
      if(fresh.length){items.push(...fresh.map(item=>({...item,feedSource:source,feedNote:note})));return;}
    }
  }
  function render() {
    const item=items[index],turn=view;
    $('swipe-source').textContent=item?labels[item.feedSource]||labels.guest:'刷视频';
    $('swipe-source').title=item?.feedNote||'';
    $('swipe-title').textContent=item?.title||'';
    $('swipe-author').textContent=item?.author||'';
    $('swipe-detail').disabled=!item;
    $('swipe-prev').disabled=index===0;
    $('swipe-next').disabled=!item||(!more&&index===items.length-1);
    const status=$('swipe-status');
    const showStatus=message=>{status.textContent=message;status.hidden=!message;};
    $('swipe-retry').hidden=true;
    if(!item){showStatus('暂时没有可播放的推荐');$('swipe-retry').hidden=false;return;}
    showStatus('正在连接视频…');
    NativePlayer.start($('swipe-player'),item.bvid,1,message=>{
      if(!active(turn))return;
      showStatus(message);
      $('swipe-retry').hidden=!message||message==='点击播放，开始观看';
    },undefined,item,{swipe:true,onEnded:()=>{
      if(active(turn)&&appPreferences.feedAutoNext)step(1);
    }});
  }
  async function step(delta) {
    if(loading||route.name!=='swipe'||index+delta<0)return false;
    const turn=view;
    loading=true;
    try{
      if(index+delta>=items.length&&more)await loadMore(turn);
      if(!active(turn))return false;
      if(!items[index+delta]){
        if(!items.length)render();
        else toast(more?'暂时没有新的推荐，稍后再试':'这一批推荐已播完');
        return false;
      }
      index+=delta;
      render();return true;
    }catch(error){
      if(active(turn)){
        if(items.length)toast(error.message);
        else{$('swipe-status').textContent=error.message;$('swipe-retry').hidden=false;}
      }
      return false;
    }finally{if(active(turn))loading=false;}
  }
  function mount() {
    $('content').innerHTML=`<section class="swipe-layout" aria-label="刷视频">
      <div class="swipe-stage"><div id="swipe-player" class="player-slot"></div><div id="swipe-status" class="play-status" role="status">正在获取推荐…</div></div>
      <div class="swipe-meta"><div><span id="swipe-source" class="live-label"></span><h1 id="swipe-title"></h1><p id="swipe-author"></p></div><div class="swipe-actions">
      <button id="swipe-retry" class="subtle-button" hidden>${icon('refresh')}重试</button>
      <button id="swipe-detail" class="primary-button" disabled>查看详情 ${icon('expand')}</button>
      <button id="swipe-prev" class="icon-button" aria-label="上一条" title="上一条" disabled>${icon('previous')}</button>
      <button id="swipe-next" class="icon-button" aria-label="下一条" title="下一条" disabled>${icon('next')}</button>
      </div></div></section>`;
    $('swipe-prev').onclick=()=>step(-1);
    $('swipe-next').onclick=()=>step(1);
    $('swipe-retry').onclick=()=>items[index]?render():step(0);
    $('swipe-detail').onclick=()=>{
      const item=items[index];
      const time=NativePlayer.current?.art?.video?.currentTime;
      if(item)watch(item.bvid,{part:1,resumeAt:Number.isFinite(time)?time:undefined,fullscreen:true});
    };
    let wheelAt=0;
    document.querySelector('.swipe-stage').addEventListener('wheel',event=>{
      if(event.ctrlKey||event.target.closest('.art-controls,.art-settings,.bili-player-menu')||Math.abs(event.deltaY)<12||Math.abs(event.deltaX)>Math.abs(event.deltaY))return;
      event.preventDefault();
      const now=Date.now(),elapsed=now-wheelAt;
      wheelAt=now;
      if(elapsed>320)step(Math.sign(event.deltaY));
    },{passive:false});
    if(items[index]){render();return true;}
    return step(0);
  }
  return {mount,reset,leave};
})();
