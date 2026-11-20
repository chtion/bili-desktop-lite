'use strict';
const Hongguo=(()=>{
  const {merge,collectPages,readLibrary,writeLibrary}=HongguoCollection;
  const browseStep=96;
  const tabs=[['home','首页'],['category','分类'],['recommended','推荐'],['mine','我的'],['sources','站源']];
  const genres=[['all','全部'],['human','真人剧'],['comic_series_rank','漫剧'],['ai_playlet','AI 剧']];
  let active=false, section='home', category='all', keyword='', detail=null;
  let view=0, playing=0, listTurn=0, listBusy=false, recommendationIndex=0, listScroll=0;
  let catalogs, favorites, recent, lastSuccess=0;
  let sourceId='hongguo', sources=[], sourceBusy=false, collecting=false;
  let catalogReady, durableLibrary=false, browseLimit=browseStep;
  let batchSize=24, pauseCollection=false, sourceMessage='';
  const builtinKey=JSON.stringify(['hongguo','home','all','']);
  const id=value=>typeof value==='string'&&/^\d{10,24}$/.test(value);
  const imported=value=>typeof value==='string'&&/^source-[a-f0-9]{32}$/.test(value);
  const sameShow=(first,second)=>first.id===second.id&&(first.sourceId||'hongguo')===(second.sourceId||'hongguo');
  const request=(method,data={})=>window.bili.api('hongguo',{method,sourceId,...data});
  const key=()=>JSON.stringify([sourceId,section,category,keyword]);
  const imageURL=item=>`bili-app://${imported(item.sourceId)?'drama-image':'hongguo-image'}/?url=${encodeURIComponent(item.cover)}`;
  const sourceName=()=>sources.find(source=>source.id===sourceId)?.name||'红果 App 源';

  function existing(name) {
    return (storage.read(name,[])||[]).map(item=>{
      if(id(item?.id)||(imported(item?.sourceId)&&/^series-[a-f0-9]{32}$/.test(item?.id)))return item;
      const previous=String(item?.url||'').match(/^https:\/\/hongguoduanju\.com\/player\/(\d{10,24})(?:\/(\d{10,24}))?(?:[/?#]|$)/);
      return previous?{id:previous[1],title:item.title,episodeId:previous[2]}:null;
    }).filter(Boolean);
  }

  function cover(item) {
    return item.cover?`<img src="${esc(imageURL(item))}" alt="" loading="lazy">`:`<span class="drama-cover-placeholder">${icon('film')}</span>`;
  }

  function cards(items, message) {
    if(!items.length)return `<p class="drama-empty">${esc(message)}</p>`;
    return `<div class="drama-grid">${items.map(item=>`<button class="drama-card" data-drama-series="${esc(item.id)}" data-drama-source-id="${esc(item.sourceId||'hongguo')}" data-drama-resume="${esc(item.episodeId||'')}">
      <span class="drama-cover">${cover(item)}${item.count?`<small>${item.count} 集</small>`:''}</span>
      <strong title="${esc(item.title)}">${esc(item.title)}</strong><small>${esc(item.number?`第 ${item.number} 集${item.done?' · 已看完':item.time?` · 看到 ${duration(item.time)}`:''}`:item.category||'')}</small>
    </button>`).join('')}</div>`;
  }

  function sourceStatus(message) {
    const label=$('drama-source-status');
    const time=sourceId==='hongguo'?lastSuccess:sources.find(source=>source.id===sourceId)?.updated;
    if(label)label.textContent=message||sourceName()+(time?` · 上次刷新 ${new Date(time).toLocaleString('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})}`:'');
  }

  function storeCatalogs() {
    const others=Object.entries(catalogs).filter(([name])=>name!==builtinKey).slice(-6);
    const entries=!durableLibrary&&catalogs[builtinKey]?[[builtinKey,catalogs[builtinKey]],...others]:others;
    storage.write('hongguo-catalog-v3',Object.fromEntries(entries.map(([name,entry])=>{
      const limit=name===builtinKey?1000:160;
      return [name,{items:entry.items.slice(0,limit),cursor:entry.items.length>limit?'':entry.cursor}];
    })));
  }
  async function saveBuiltin(entry) {
    try{await writeLibrary(entry);}
    catch{throw new Error('红果剧库保存失败，请检查本地存储空间后重试。');}
    catalogs[builtinKey]=entry;
    const migrated=!durableLibrary;
    durableLibrary=true;
    lastSuccess=entry.updated;
    storage.write('hongguo-last-refresh',lastSuccess);
    if(migrated)storeCatalogs();
  }
  function initializeCatalogs() {
    catalogs??=storage.read('hongguo-catalog-v3',{});
    catalogReady??=readLibrary().then(async saved=>{
      if(Array.isArray(saved?.items)){
        catalogs[builtinKey]=saved;durableLibrary=true;
        lastSuccess=saved.updated||lastSuccess;
        storeCatalogs();
      }else if(catalogs[builtinKey]?.items.length){
        await saveBuiltin({...catalogs[builtinKey],updated:lastSuccess||Date.now()});
      }
    }).catch(()=>{sourceMessage='本机剧库缓存暂时无法读取，请重试。';});
    return catalogReady;
  }

  function renderListing() {
    const target=$('drama-list');
    if(!target||detail)return;
    if(section==='mine'){
      target.innerHTML=`<section><h2>本机收藏</h2>${cards(favorites,'还没有收藏')}</section>
        <section><h2>最近观看</h2>${cards(recent,'还没有播放记录')}</section>`;
      return;
    }
    const result=catalogs[key()];
    const list=result?.items||[];
    const fetching=listBusy||(collecting&&key()===builtinKey);
    const displayed=list.slice(0,browseLimit), remaining=displayed.length<list.length;
    const hasRemote=Boolean(result?.cursor)&&!result?.end;
    target.innerHTML=cards(displayed,fetching?'正在读取剧库…':keyword?'没有找到相关短剧':'暂无短剧')+
      (remaining||hasRemote?`<div class="load-more"><button class="secondary-button" data-drama-more ${!remaining&&fetching?'disabled':''}>${remaining?`继续浏览（已显示 ${displayed.length} / ${list.length} 部）`:'加载更多'}</button></div>`:'');
  }

  async function loadCatalog({append=false,refresh=false,autoplay=false}={}) {
    if(['mine','sources'].includes(section)||!active)return false;
    if(collecting&&key()===builtinKey)return false;
    const turn=++listTurn, name=key(), previous=catalogs[name];
    const stillActive=()=>active&&listTurn===turn&&name===key();
    listBusy=true;
    sourceStatus(refresh?'正在刷新剧库…':`正在读取 ${sourceName()}…`);
    renderListing();
    try {
      const result=await request('catalog',{section,category,keyword,cursor:append?previous?.cursor:undefined});
      if(!stillActive())return false;
      const items=append?merge(previous?.items||[],result.items):refresh&&sourceId==='hongguo'&&previous?merge(result.items,previous.items):result.items;
      if(name===builtinKey){
        const maintain=refresh&&previous?.items.length;
        const next=maintain?previous.cursor:result.cursor;
        let end='';
        if(maintain)end=previous.end||'';
        else if(result.more===false)end='complete';
        else if(result.more&&(!next||append&&next===previous?.cursor))end='cursor';
        await saveBuiltin({items,cursor:next,end,updated:Date.now()});
      }else{
        catalogs[name]={items,cursor:result.cursor!==previous?.cursor||!append?result.cursor:''};
        storeCatalogs();
      }
      if(!stillActive())return false;
      if(sourceId==='hongguo'&&name!==builtinKey){
        lastSuccess=Date.now();storage.write('hongguo-last-refresh',lastSuccess);
      }
      sourceStatus();
      if(autoplay&&items.length){
        recommendationIndex=Math.min(recommendationIndex,items.length-1);
        const item=items[recommendationIndex];
        void openSeries(item.id,undefined,item.sourceId||sourceId);
      }
      return true;
    }catch(error){
      if(stillActive())sourceStatus(previous?.items?.length?`${error.message} 已保留上次的剧库。`:error.message);
      return false;
    }finally{if(stillActive()){listBusy=false;renderListing();}}
  }

  function shell() {
    $('content').innerHTML=`<section class="drama-workspace" aria-label="红果短剧">
      <div class="drama-toolbar"><div class="drama-brand">${icon('film')}<h1>红果短剧</h1></div>
        <div class="drama-nav" aria-label="短剧导航">${tabs.map(([name,label])=>`<button data-drama-section="${name}" aria-pressed="${name===section}">${label}</button>`).join('')}</div>
        <button class="icon-button" data-drama-refresh title="刷新剧库" aria-label="刷新剧库">${icon('refresh')}</button>
      </div>
      <p id="drama-source-status" role="status"></p>
      <div id="drama-area"></div>
    </section>`;
    sourceStatus();
  }

  function renderBrowse() {
    if(section==='sources'){renderSources();return;}
    $('drama-area').innerHTML=`<div class="drama-browse"><div class="drama-listbar" ${section==='mine'?'hidden':''}>
      ${section==='category'?`<div class="drama-categories" aria-label="剧集分类">${genres.map(([value,label])=>`<button class="subtle-button" data-drama-category="${value}" aria-pressed="${category===value}">${label}</button>`).join('')}</div>`:''}
      ${section==='home'?'<h2>短剧剧库</h2>':''}
      <div class="drama-filters"><select id="drama-source" aria-label="选择短剧来源"><option value="hongguo">红果 App 源</option>${sources.map(source=>`<option value="${source.id}" ${sourceId===source.id?'selected':''}>${esc(source.name)}</option>`).join('')}</select>
      <form id="drama-search-form"><input id="drama-search" value="${esc(keyword)}" aria-label="搜索短剧" placeholder="搜索剧名" maxlength="100"><button class="subtle-button" type="submit">搜索</button></form></div>
    </div><div id="drama-list"></div></div>`;
    renderListing();
  }

  function selectSection(next) {
    view++;listTurn++;listBusy=false;
    detail=null;keyword='';category='all';section=next;listScroll=0;browseLimit=browseStep;
    NativePlayer.destroy();setPlaying(false);
    shell();renderBrowse();$('workspace').scrollTop=0;updateBackButton();
    if(next==='mine')return;
    if(next==='sources'){void refreshSourceList();return;}
    const saved=catalogs[key()]?.items||[];
    if(next==='recommended'&&saved.length){
      recommendationIndex=Math.min(recommendationIndex,saved.length-1);
      void openSeries(saved[recommendationIndex].id,undefined,saved[recommendationIndex].sourceId||sourceId);
    }else if(!saved.length)void loadCatalog({autoplay:next==='recommended'});
  }

  function renderSources(message=sourceMessage) {
    const target=$('drama-area');
    if(!target||section!=='sources')return;
    const builtin=catalogs[builtinKey];
    const draft=$('drama-subscribe-url')?.value||'';
    target.innerHTML=`<div class="drama-sources">
      <div class="drama-source-actions"><button class="primary-button" data-source-files ${sourceBusy?'disabled':''}>${icon('plus')} 导入文件</button>
      <form id="drama-subscribe"><input id="drama-subscribe-url" type="url" aria-label="HTTPS 订阅地址" placeholder="粘贴 JSON 或 M3U 订阅地址" value="${esc(draft)}" required maxlength="4096"><button class="secondary-button" type="submit" ${sourceBusy?'disabled':''}>添加订阅</button></form></div>
      <p class="drama-import-status" role="status">${esc(message)}</p>
      <article class="drama-source-row"><div><strong>红果 App 源</strong><small id="drama-builtin-count">剧库已获取 ${builtin?.items.length||0} 部${lastSuccess?` · ${esc(new Date(lastSuccess).toLocaleString('zh-CN'))}`:''}${builtin?.end==='complete'?' · 已到当前目录末尾':''}</small></div>
      <div><button class="subtle-button" data-source-view="hongguo">浏览</button>
      <label class="drama-batch-label">每次获取 <select id="drama-batch" aria-label="每次获取的页数" ${collecting?'disabled':''}>${[12,24,48].map(value=>`<option value="${value}" ${value===batchSize?'selected':''}>${value} 页</option>`).join('')}</select></label>
      <button class="secondary-button" data-source-collect ${collecting?'disabled':''}>${collecting?'获取中…':builtin?.end==='complete'?'检查新剧':'获取更多剧目'}</button>
      ${collecting?`<button class="subtle-button" data-source-pause ${pauseCollection?'disabled':''}>${pauseCollection?'正在暂停…':'暂停'}</button>`:''}</div></article>
      ${sources.map(source=>`<article class="drama-source-row"><div><strong>${esc(source.name)}</strong><small>${source.count} 部短剧 · ${esc(new Date(source.updated).toLocaleString('zh-CN'))}</small></div>
      <div><button class="subtle-button" data-source-view="${source.id}">浏览</button><button class="subtle-button" data-source-update="${source.id}" ${sourceBusy?'disabled':''}>更新</button><button class="subtle-button" data-source-remove="${source.id}" ${sourceBusy?'disabled':''}>移除</button></div></article>`).join('')}
      <details class="drama-import-help"><summary>查看支持的导入格式</summary><p>JSON 可按剧目组织分集，M3U 可批量导入视频链接。媒体支持公网 HTTPS 的 MP4 和 HLS。</p>
      <pre>{ "name": "我的短剧", "items": [{ "title": "短剧名称",
  "episodes": [{ "title": "第 1 集", "url": "https://example.com/episode-1.mp4" }]
}] }</pre></details>
    </div>`;
  }

  function applySources(next) {
    const versions=new Map(next.map(source=>[source.id,source.updated]));
    for(const old of sources){
      if(versions.get(old.id)!==old.updated){
        for(const cacheKey of Object.keys(catalogs)){
          if(cacheKey.startsWith(`["${old.id}",`))delete catalogs[cacheKey];
        }
      }
    }
    sources=next;
    if(imported(sourceId)&&!versions.has(sourceId))sourceId='hongguo';
  }

  async function refreshSourceList() {
    try {
      applySources(await window.bili.api('drama-sources',{action:'list'}));
      if(active&&section==='sources'&&!sourceBusy)renderSources();
      else if(active&&!detail&&$('drama-source'))renderBrowse();
    }catch(error){if(active&&section==='sources')renderSources(error.message);}
  }

  async function manageSource(action,value) {
    if(sourceBusy)return;
    sourceBusy=true;renderSources(action==='files'?'请选择要导入的列表文件。':'正在更新站源…');
    let message='';
    try {
      if(action==='files'){
        const result=await window.bili.api('drama-import-files');
        if(!result.canceled){applySources(result.sources);message=result.errors.length?result.errors.join(' · '):'站源已导入。';}
      }else{
        applySources(await window.bili.api('drama-sources',{action,value}));
        if(action==='subscribe'&&$('drama-subscribe-url'))$('drama-subscribe-url').value='';
        message=action==='remove'?'已移除站源。':'站源已更新。';
      }
      storeCatalogs();
    }catch(error){message=error.message;}
    finally{sourceBusy=false;if(active&&section==='sources')renderSources(message);}
  }

  async function collect() {
    if(collecting)return;
    collecting=true;pauseCollection=false;
    const initial=catalogs[builtinKey]||{items:[],cursor:''};
    const limit=batchSize;
    sourceMessage='正在从红果获取更多剧目…';renderSources();
    try{
      const result=await collectPages({
        initial,limit,
        fetchPage:cursor=>request('catalog',{sourceId:'hongguo',section:'home',category:'all',cursor}),
        checkpoint:async (entry,pages)=>{
          await saveBuiltin({...entry,updated:Date.now()});
          sourceMessage=`已获取 ${pages} / ${limit} 页，新增 ${entry.items.length-initial.items.length} 部。`;
          if(active&&section==='sources'){
            const notice=document.querySelector('.drama-import-status');
            if(notice)notice.textContent=sourceMessage;
            const count=$('drama-builtin-count');
            if(count)count.textContent=`剧库已获取 ${entry.items.length} 部`;
          }
        },
        stopped:()=>pauseCollection,
        wait:()=>new Promise(resolve=>setTimeout(resolve,800))
      });
      const end={
        complete:'已到当前红果目录末尾。',
        cursor:'红果没有提供新的分页位置，已保存已获取的剧目。',
        stalled:'连续三页内容重复，已保存已获取的剧目。',
        paused:'已暂停，可从保存的位置继续获取。'
      }[result.reason]||'';
      sourceMessage=`本次新增 ${result.added} 部，剧库共 ${result.state.items.length} 部。${end}`;
    }catch(error){
      sourceMessage=`${error.message} 本次已保存 ${(catalogs[builtinKey]?.items.length||0)-initial.items.length} 部新剧。`;
    }
    finally{
      collecting=false;pauseCollection=false;
      if(active&&section==='sources')renderSources();
      else if(active&&!detail&&key()===builtinKey){sourceStatus();renderListing();}
    }
  }

  function loadMore() {
    const entry=catalogs[key()];
    if(!entry)return;
    const hasLocal=entry.items.length>browseLimit;
    browseLimit+=browseStep;
    if(hasLocal)renderListing();
    else if(entry.cursor&&!entry.end)void loadCatalog({append:true});
  }

  function setPlaying(value) {
    window.bili.command('play-state',value);
    $('pin-window').hidden=!value;
  }

  function canGoBack() {return active&&!!detail;}
  function back() {
    if(!canGoBack())return false;
    view++;detail=null;
    NativePlayer.destroy();setPlaying(false);renderBrowse();
    $('workspace').scrollTop=listScroll;updateBackButton();
    return true;
  }

  function episodeList() {
    $('drama-episodes').innerHTML=detail.episodes.map(item=>`<button data-drama-episode="${item.id}" aria-current="${detail.selected?.id===item.id}" title="${esc(item.title||(item.playable?'可尝试内播':'官方观看'))}">第 ${item.number} 集${item.playable?'':' <small>官方</small>'}</button>`).join('');
    $('drama-more-episodes').hidden=!detail.cursor;
    const saved=favorites.some(item=>sameShow(item,detail.series));
    $('drama-save').setAttribute('aria-pressed',String(saved));
    $('drama-save').title=saved?'取消收藏':'收藏短剧';
  }

  function detailMarkup(series) {
    const current=section==='recommended'?(catalogs[key()]?.items?.length||0):0;
    return `<div class="drama-detail-toolbar">
      <button class="subtle-button" data-drama-back>${icon('back')} 返回列表</button>
      ${current?`<div><button class="subtle-button" data-drama-step="-1" ${recommendationIndex<=0?'disabled':''}>${icon('previous')} 上一部</button>
      <button class="subtle-button" data-drama-step="1">下一部 ${icon('next')}</button></div>`:''}
    </div>
    <div class="drama-detail">
      <div class="drama-player-column"><div class="drama-stage"><div id="drama-player"></div>
        <div id="drama-player-status" class="drama-player-status"><p id="drama-play-message" role="status">正在获取播放地址…</p>
          <button class="primary-button" data-drama-official hidden>${icon('link')} 官方观看</button>
          <button class="subtle-button" data-drama-retry hidden>重试</button></div></div>
      <div class="drama-play-actions"><span id="drama-current"></span><button class="subtle-button" data-drama-next>下一集 ${icon('arrow')}</button></div></div>
      <aside class="drama-info"><div class="drama-title"><span class="drama-cover">${cover(series)}</span>
      <div><h2>${esc(series.title)}</h2><p>${esc(series.category)} ${series.count?`· ${series.count} 集`:''}</p></div>
      <button id="drama-save" class="icon-button" data-drama-save aria-label="收藏短剧">${icon('heart')}</button></div>
      <p class="drama-description">${esc(series.description||'暂无简介')}</p>
      <h3>选集</h3><div id="drama-episodes" class="drama-episodes"></div>
      <button id="drama-more-episodes" class="subtle-button" data-drama-more-episodes hidden>加载更多集数</button></aside>
    </div>`;
  }

  async function openSeries(seriesId,episodeId,origin=sourceId) {
    const turn=++view;
    if(!detail)listScroll=$('workspace').scrollTop;
    detail={id:seriesId,sourceId:origin,loading:true};
    NativePlayer.destroy();setPlaying(false);updateBackButton();
    $('drama-area').innerHTML='<p class="drama-empty" role="status">正在读取分集…</p>';
    $('workspace').scrollTop=0;
    try {
      const result=await request('detail',{sourceId:origin,seriesId});
      if(!active||turn!==view)return;
      if(!result.series.id)throw new Error('红果未返回短剧资料。');
      detail={id:seriesId,sourceId:origin,series:result.series,episodes:result.items.sort((a,b)=>a.number-b.number),cursor:result.cursor,selected:null,busy:false};
      $('drama-area').innerHTML=detailMarkup(detail.series);
      const record=recent.find(item=>item.id===seriesId&&(item.sourceId||'hongguo')===origin);
      let next=detail.episodes.find(item=>item.id===(episodeId||record?.episodeId));
      while(!next&&(episodeId||record?.episodeId)&&detail.cursor&&active&&turn===view){
        if(!await moreEpisodes())break;
        if(!active||turn!==view)return;
        next=detail.episodes.find(item=>item.id===(episodeId||record?.episodeId));
      }
      episodeList();
      if(next||detail.episodes.length)await play(next||detail.episodes[0]);
      else $('drama-play-message').textContent='暂时没有选集。';
    }catch(error){
      if(active&&turn===view)$('drama-area').innerHTML=`<p class="drama-empty" role="status">${esc(error.message)} <button class="subtle-button" data-drama-series="${esc(seriesId)}" data-drama-source-id="${esc(origin)}">重试</button></p>`;
    }
  }

  function saveProgress(series,selected,video) {
    let played=false, last=-1;
    const save=()=>{
      if(!played||!Number.isFinite(video.duration)||video.duration<=0)return;
      const time=Math.floor(video.currentTime), done=video.ended;
      if(time===last&&!done)return;
      last=time;
      recent=[{...series,episodeId:selected.id,number:selected.number,time,done},...recent.filter(item=>!sameShow(item,series))].slice(0,80);
      storage.write('hongguo-recent',recent);
    };
    video.addEventListener('playing',()=>{played=true;},{once:true});
    video.addEventListener('pause',save);
    video.addEventListener('seeked',save);
    video.addEventListener('ended',save);
    video.addEventListener('timeupdate',()=>{if(video.currentTime-last>=4)save();});
    return save;
  }

  async function play(selected) {
    if(!selected||!detail?.series)return;
    const current=detail, turn=++playing;
    detail.selected=selected;
    const record=recent.find(item=>item.id===current.id&&item.episodeId===selected.id&&(item.sourceId||'hongguo')===current.sourceId);
    const overlay=$('drama-player-status');
    function status(message) {
      if(!active||detail!==current||turn!==playing)return;
      $('drama-play-message').textContent=message;
      overlay.hidden=!message;
      const waiting=message==='正在获取播放地址…';
      overlay.querySelector('[data-drama-retry]').hidden=waiting||!selected.playable;
      overlay.querySelector('[data-drama-official]').hidden=waiting||current.sourceId!=='hongguo';
    }
    $('drama-current').textContent=`第 ${selected.number} 集${selected.title&&selected.title.replace(/\s/g,'')!==`第${selected.number}集`&&selected.title!==String(selected.number)?' · '+selected.title:''}`;
    document.querySelector('[data-drama-next]').disabled=selected.id===detail.episodes.at(-1)?.id&&!detail.cursor;
    episodeList();status('正在获取播放地址…');setPlaying(true);
    await NativePlayer.start($('drama-player'),null,null,status,null,null,{
      getSource:()=>request('playback',{sourceId:current.sourceId,seriesId:current.id,episodeId:selected.id}),
      resumeAt:record&&!record.done?Number(record.time)||0:0,
      track:video=>saveProgress(current.series,selected,video),
      onEnded:()=>{if(active&&detail===current&&turn===playing&&appPreferences.detailAutoNext)void nextEpisode();}
    });
  }

  async function moreEpisodes() {
    if(!detail?.cursor||detail.busy)return false;
    const current=detail, start=current.cursor, button=$('drama-more-episodes');
    current.busy=true;button.disabled=true;
    try {
      const result=await request('episodes',{sourceId:current.sourceId,seriesId:current.id,cursor:start});
      if(!active||detail!==current)return false;
      current.episodes=[...new Map([...current.episodes,...result.items].map(item=>[item.id,item])).values()].sort((a,b)=>a.number-b.number);
      current.cursor=result.cursor!==start?result.cursor:'';
      episodeList();return result.items.length>0;
    }catch(error){if(active&&detail===current)toast(error.message);return false;}
    finally{current.busy=false;button.disabled=false;}
  }

  async function nextEpisode() {
    const current=detail, selected=current?.selected;
    if(!selected)return;
    const position=current.episodes.findIndex(item=>item.id===selected.id);
    if(position===current.episodes.length-1&&current.cursor)await moreEpisodes();
    if(!active||detail!==current||current.selected!==selected)return;
    const next=current.episodes[current.episodes.findIndex(item=>item.id===selected.id)+1];
    if(next)void play(next);
  }

  async function step(delta) {
    if(section!=='recommended'||listBusy)return;
    const current=detail, index=recommendationIndex+delta;
    if(index<0)return;
    if(index>=(catalogs[key()]?.items.length||0)&&catalogs[key()]?.cursor)await loadCatalog({append:true});
    if(!active||section!=='recommended'||detail!==current)return;
    const next=catalogs[key()]?.items[index];
    if(!next){toast('已经刷到这批推荐的最后一部');return;}
    recommendationIndex=index;
    void openSeries(next.id,undefined,next.sourceId||sourceId);
  }

  function refresh() {
    if(!active)return;
    if(detail?.id){void openSeries(detail.id,detail.selected?.id,detail.sourceId);return;}
    if(section==='sources'){void refreshSourceList();return;}
    if(section!=='mine')void loadCatalog({refresh:true,autoplay:section==='recommended'});
  }

  async function mount() {
    const turn=++view;
    favorites=existing('hongguo-favorites');
    recent=existing('hongguo-recent');
    lastSuccess=storage.read('hongguo-last-refresh',0);
    const savedBatch=storage.read('hongguo-fetch-pages',24);
    batchSize=[12,24,48].includes(savedBatch)?savedBatch:24;
    active=true;
    await initializeCatalogs();
    if(!active||route.name!=='hongguo'||turn!==view)return false;
    shell();renderBrowse();
    void refreshSourceList();
    const items=catalogs[key()]?.items;
    if(section==='recommended'&&items?.length){
      const item=items[Math.min(recommendationIndex,items.length-1)];
      void openSeries(item.id,undefined,item.sourceId||sourceId);
    }else if(!items?.length&&!['mine','sources'].includes(section))void loadCatalog({autoplay:section==='recommended'});
    return true;
  }

  function leave() {
    if(!active)return;
    active=false;view++;playing++;listTurn++;listBusy=false;detail=null;keyword='';
  }

  document.addEventListener('submit',event=>{
    if(!active)return;
    if(event.target.id==='drama-subscribe'){
      event.preventDefault();void manageSource('subscribe',$('drama-subscribe-url').value.trim());return;
    }
    if(event.target.id!=='drama-search-form')return;
    event.preventDefault();
    keyword=$('drama-search').value.trim();
    if(section==='recommended')section='home';
    shell();renderBrowse();void loadCatalog();
  });
  document.addEventListener('change',event=>{
    if(active&&event.target.id==='drama-batch'){
      const selected=Number(event.target.value);
      if([12,24,48].includes(selected)){batchSize=selected;storage.write('hongguo-fetch-pages',batchSize);}
    }
    if(active&&event.target.id==='drama-source'){
      sourceId=event.target.value;recommendationIndex=0;selectSection(section);
    }
  });

  document.addEventListener('click',event=>{
    const button=event.target.closest('.drama-workspace button');
    if(!active||!button)return;
    const data=button.dataset;
    if(data.dramaSection)selectSection(data.dramaSection);
    else if(data.dramaCategory){category=data.dramaCategory;keyword='';renderBrowse();void loadCatalog();}
    else if(data.dramaSeries){void openSeries(data.dramaSeries,data.dramaResume,data.dramaSourceId||sourceId);}
    else if(data.dramaEpisode){void play(detail?.episodes.find(item=>item.id===data.dramaEpisode));}
    else if('dramaBack'in data)back();
    else if('dramaRefresh'in data)refresh();
    else if('dramaMore'in data&&!listBusy)loadMore();
    else if('dramaMoreEpisodes'in data)void moreEpisodes();
    else if('dramaNext'in data)void nextEpisode();
    else if('dramaStep'in data)void step(Number(data.dramaStep));
    else if('dramaRetry'in data&&detail?.selected)void play(detail.selected);
    else if('dramaOfficial'in data&&detail?.id){
      window.bili.api('hongguo-official',{seriesId:detail.id,episodeId:detail.selected?.id}).catch(error=>toast(error.message));
    }else if('dramaSave'in data&&detail?.series){
      const item=detail.series, found=favorites.some(saved=>sameShow(saved,item));
      favorites=found?favorites.filter(saved=>!sameShow(saved,item)):[item,...favorites].slice(0,200);
      storage.write('hongguo-favorites',favorites);episodeList();toast(found?'已取消收藏':'已收藏');
    }else if('sourceFiles'in data)void manageSource('files');
    else if('sourceCollect'in data)void collect();
    else if('sourcePause'in data){pauseCollection=true;renderSources();}
    else if(data.sourceUpdate)void manageSource('refresh',data.sourceUpdate);
    else if(data.sourceRemove)void manageSource('remove',data.sourceRemove);
    else if(data.sourceView){sourceId=data.sourceView;recommendationIndex=0;selectSection('home');}
  });

  let wheelAt=0;
  document.addEventListener('wheel',event=>{
    if(!active||section!=='recommended'||!detail?.series||event.ctrlKey||Math.abs(event.deltaY)<20||Math.abs(event.deltaX)>Math.abs(event.deltaY)||
      !event.target.closest('.drama-stage')||event.target.closest('.art-controls,.art-settings,.bili-player-menu,button'))return;
    event.preventDefault();
    const now=Date.now(), elapsed=now-wheelAt;
    wheelAt=now;
    if(elapsed>320)void step(Math.sign(event.deltaY));
  },{passive:false});

  return {mount,leave,refresh,canGoBack,back};
})();
