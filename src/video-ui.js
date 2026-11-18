'use strict';
let videoState=null,actionBusy=false,collectionPage=0,collectionItems=[],collectionBusy=false;
function renderVideoDetail(v){
  videoState=null;actionBusy=false;collectionPage=0;collectionItems=[];collectionBusy=false;
  const isEpisode=v.kind==='episode';
  const published=v.published?new Date(v.published*1000).toLocaleString('zh-CN',{hour12:false,dateStyle:'medium',timeStyle:'short'}):'';
  const stats=isEpisode?[v.showRating&&`${esc(v.showRating)} 分`,esc(v.showUpdate)].filter(Boolean).map(text=>`<span>${text}</span>`).join(''):
    `<span>${icon('play')}${number(v.views)} 播放</span><span>${icon('comment')}${number(v.danmaku)} 弹幕</span>${published?`<span>${esc(published)}</span>`:''}`;
  const creator=isEpisode?`<button class="creator" data-season="${v.seasonId}">${icon('film')}<strong>番剧资料与选集</strong></button>`:
    `<button class="creator" data-user-space="${v.authorMid}">${v.avatar?`<img src="${esc(image(v.avatar))}" alt="">`:icon('user')}<span><strong>${esc(v.author)}</strong><small id="creator-stats" hidden></small></span></button>`;
  const collection=v.collection||v.pages.length>1;
  const collectionTitle=v.collection?.title||'视频选集';
  const collectionCount=v.collection?.count||v.pages.length;
  $('video-detail').innerHTML=`
    <span class="video-category">${esc(isEpisode?'番剧 · '+v.category:[v.category,v.original?'原创':''].filter(Boolean).join(' · '))}</span>
    <h1>${esc(v.title)}</h1><div class="watch-stats">${stats}<span id="watch-online" hidden></span></div>
    <div class="watch-toolbar">${creator}<button id="follow-video" class="follow-button" data-video-action="${isEpisode?'show-follow':'follow'}"></button></div>
    <div class="video-actions" id="video-actions"></div><p id="video-state-note" class="action-note" role="status"></p>
    ${collection?`<button class="collection-link" data-watch-tab="parts">${icon('film')}<span>${esc(collectionTitle)}<small>共 ${collectionCount} 个内容 · 查看选集</small></span>${icon('arrow')}</button>`:''}
    <section id="chapters-area" hidden></section>
    <h2 class="description-title">简介</h2><p class="description">${esc(v.description||'暂无简介。')}</p>
    <div id="video-tags" class="video-tags" hidden></div>
    <div class="watch-detail-footer"><button class="subtle-button watch-save" data-save="${esc(v.bvid)}">${icon('heart')}本地收藏</button><span id="history-sync-status" role="status"></span></div>`;
  if(v.comments)document.querySelector('.watch-tabs [data-watch-tab=comments]').innerHTML=`评论 <small>${number(v.comments)}</small>`;
  renderVideoActions();loadVideoState();renderParts(v);
}
function renderVideoExtra(data) {
  const tags=$('video-tags'),creator=$('creator-stats');
  tags.innerHTML=data.tags.map(tag=>`<button data-video-tag="${esc(tag)}">${esc(tag)}</button>`).join('');
  tags.hidden=!data.tags.length;
  if(creator&&(data.fans||data.uploads)) {
    creator.hidden=false;
    creator.textContent=[data.fans&&`${number(data.fans)} 粉丝`,data.uploads&&`${number(data.uploads)} 投稿`].filter(Boolean).join(' · ');
  }
}
function renderPlayerDetails(data) {
  const chapters=$('chapters-area'),online=$('watch-online');
  if(!chapters||!online)return;
  online.textContent=data.online?`${number(data.online)} 人在看`:'';
  online.hidden=!data.online;
  chapters.hidden=!data.chapters?.length;
  chapters.innerHTML=chapters.hidden?'':`<h2 class="description-title">视频章节</h2><div class="chapter-list">${data.chapters.map(chapter=>`<button data-chapter="${chapter.time}"><small>${duration(Math.floor(chapter.time))}</small><span>${esc(chapter.title)}</span>${icon('play')}</button>`).join('')}</div>`;
}
function renderVideoActions(){
  const v=activeVideo;if(!v||!$('video-actions'))return;
  const disabled=actionBusy?'disabled':'',state=videoState||{};
  $('video-actions').innerHTML=[['like','like',state.like?'已点赞':'点赞',v.likes,!!state.like],['coin','coin',Number(state.coin)>0?'已投 '+state.coin+' 枚':'投币',v.coins,!!state.coin],['favorite','star',state.favorite?'已收藏':'收藏',v.favorites,!!state.favorite],['share','link','分享',v.shares,false]].filter(x=>v.kind!=='episode'||['favorite','share'].includes(x[0])).map(([action,symbol,title,count,selected])=>`<button data-video-action="${action}" aria-pressed="${selected}" class="${selected?'selected':''}" ${disabled}>${icon(symbol)}<span>${esc(title)}</span><small>${number(count)}</small></button>`).join('');
  const follow=$('follow-video');if(follow){follow.disabled=actionBusy;const selected=v.kind==='episode'?v.seasonFollowed:!!state.attention;follow.textContent=selected?(v.kind==='episode'?'已追番':'已关注'):(v.kind==='episode'?'+ 追番':'+ 关注');follow.classList.toggle('selected',selected);}
}
async function loadVideoState(){
  const turn=generation;if(!activeVideo)return;
  try{const s=await window.bili.api('video-state',{bvid:activeVideo.bvid});if(turn!==generation)return;videoState=s;$('video-state-note').textContent=s.loggedIn?'互动将同步到你的 B站账号':'登录后可点赞、投币和同步收藏';renderVideoActions();}
  catch(e){if(turn===generation){videoState=null;$('video-state-note').innerHTML=esc(e.message)+' <button class="subtle-button" data-video-action="state">重试状态</button>';}}
}
function closeAction(){if(actionBusy)return;$('action-dialog').close();}
function actionDialog(title,body,submit){
  const d=$('action-dialog');d.innerHTML=`<form id="video-action-form"><div class="action-heading"><h2>${esc(title)}</h2><button type="button" class="icon-button" data-close-action aria-label="关闭">${icon('close')}</button></div>${body}<p id="action-error" role="alert"></p><div class="action-footer"><button type="button" class="secondary-button" data-close-action>取消</button>${submit?`<button type="submit" class="primary-button">${esc(submit)}</button>`:''}</div></form>`;if(!d.open)d.showModal();
}
async function performVideoAction(method,data,success){
  if(actionBusy)return;actionBusy=true;renderVideoActions();const turn=generation,v=activeVideo;
  const form=$('video-action-form');if(form)form.querySelectorAll('button,input').forEach(b=>b.disabled=true);
  try{
    const r=await window.bili.api(method,{bvid:v.bvid,...data});if(turn!==generation)return;
    if(method==='like-video')v.likes=Math.max(0,v.likes+(data.like?1:-1));
    if(method==='coin-video')v.coins+=data.count;
    if(method==='show-follow')v.seasonFollowed=r.followed;
    if(r.state)videoState=r.state;else await loadVideoState();
    $('action-dialog').close();toast(success);updateAccount();
  }catch(e){if(turn===generation){if($('action-dialog').open)$('action-error').textContent=e.message;else toast(e.message);await loadVideoState();}}
  finally{actionBusy=false;if(turn===generation){renderVideoActions();form?.querySelectorAll('button,input').forEach(b=>b.disabled=false);}}
}
async function videoAction(action){
  if(!activeVideo||actionBusy)return;
  if(action==='state'){loadVideoState();return;}
  if(action==='share'){try{await window.bili.api('share-video',{bvid:activeVideo.bvid,episodeId:activeVideo.episodeId});toast('视频链接已复制');}catch(e){toast(e.message);}return;}
  if(!videoState){await loadVideoState();if(!videoState)return;}
  if(!videoState.loggedIn){actionDialog('登录 B站','<p>登录后，你的互动会同步到 B站账号。</p><button type="button" class="primary-button" data-login>登录 B站</button>');return;}
  if(action==='like'){performVideoAction('like-video',{like:!videoState.like},videoState.like?'已取消点赞':'点赞成功');return;}
  if(action==='coin'){
    const available=activeVideo.coinLimit-Number(videoState.coin||0);if(available<=0){toast('已达到这个视频的投币上限');return;}
    actionDialog('为喜欢的视频投币',`<p>已投 ${Number(videoState.coin)||0} 枚，本次最多可投 ${available} 枚。投币会消耗账号硬币。</p><div class="coin-options">${Array.from({length:available},(_,i)=>`<label><input type="radio" name="coins" value="${i+1}" ${i===0?'checked':''}>${icon('coin')} ${i+1} 枚</label>`).join('')}</div><label class="favorite-option"><input id="coin-like" type="checkbox" ${videoState.like?'checked':''}>同时点赞</label>`,'确认投币');
    $('video-action-form').onsubmit=e=>{e.preventDefault();performVideoAction('coin-video',{count:Number(document.querySelector('[name=coins]:checked').value),alsoLike:$('coin-like').checked},'投币成功');};return;
  }
  if(action==='favorite'){
    const turn=generation;actionDialog('收藏到 B站','<p>正在读取收藏夹…</p>');
    try{const f=await window.bili.api('video-folders',{bvid:activeVideo.bvid});if(turn!==generation||!$('action-dialog').open)return;
      actionDialog('收藏到 B站',f.folders.length?'<div class="favorite-options">'+f.folders.map(x=>`<label class="favorite-option"><input type="checkbox" name="folder" value="${x.id}" ${x.selected?'checked':''}><span>${esc(x.title)}</span><small>${x.count} 个视频</small></label>`).join('')+'</div>':'<p>你的账号还没有收藏夹，请先在 B站创建一个。</p>',f.folders.length?'保存收藏':null);
      if(f.folders.length)$('video-action-form').onsubmit=e=>{e.preventDefault();performVideoAction('favorite-video',{folders:[...document.querySelectorAll('[name=folder]:checked')].map(x=>Number(x.value))},'收藏夹已更新');};
    }catch(e){if(turn===generation&&$('action-dialog').open)$('action-error').textContent=e.message;}return;
  }
  const show=action==='show-follow',following=show?activeVideo.seasonFollowed:videoState.attention;
  const submit=()=>performVideoAction(show?'show-follow':'follow-author',{follow:!following,...(show?{seasonId:activeVideo.seasonId}:{})},following?'已取消关注':show?'已加入追番':'关注成功');
  if(following){actionDialog(show?'取消追番？':'取消关注这位 UP 主？','<p>这个操作会同步到你的 B站账号。</p>','确认取消');$('video-action-form').onsubmit=e=>{e.preventDefault();submit();};}else submit();
}
function partButtons(items,episode=false){return items.map(v=>`<button ${episode?`data-episode="${v.episodeId}"`:`data-watch="${esc(v.bvid)}"`} class="${episode?v.episodeId===activeVideo?.episodeId?'active':'':v.bvid===activeVideo?.bvid?'active':''}"><small>${episode?icon('play'):icon('video')}</small><span>${esc(v.title)}</span>${v.badge?`<em>${esc(v.badge)}</em>`:''}</button>`).join('');}
function renderParts(v){
  const c=v.collection;
  $('parts-panel').innerHTML=(v.kind!=='episode'?`<p class="pane-caption">当前视频 · ${v.pages.length} P</p><div class="part-list">${v.pages.map(p=>`<button data-part="${p.page}" class="${p.page===route.part?'active':''}"><small>P${p.page}</small><span>${esc(p.title)}</span><em>${duration(p.duration)}</em></button>`).join('')}</div>`:'')+(c?`<div class="collection-heading"><h3>${esc(c.title)}</h3><span>${c.count} 个内容</span></div><div id="collection-items">${c.sections.map(g=>`<p class="pane-caption">${esc(g.title)}</p><div class="part-list">${partButtons(g.items,c.kind==='episode')}</div>`).join('')}</div>${c.kind==='video'&&c.count>c.sections.reduce((n,g)=>n+g.items.length,0)?'<button class="secondary-button" id="collection-more">查看完整合集</button>':''}`:'');
  document.querySelector('.watch-tabs [data-watch-tab=parts]').textContent=v.kind==='episode'?'选集':c?'合集 / 分 P':'分 P';
}
async function moreCollection(){
  if(collectionBusy||!activeVideo)return;collectionBusy=true;const turn=generation,button=$('collection-more');button.disabled=true;
  try{const d=await window.bili.api('collection',{bvid:activeVideo.bvid,page:collectionPage+1});if(turn!==generation)return;collectionPage++;collectionItems.push(...d.items.filter(v=>!collectionItems.some(x=>x.bvid===v.bvid)));remember(collectionItems);$('collection-items').innerHTML='<div class="part-list">'+partButtons(collectionItems)+'</div>';button.hidden=!d.more;button.textContent='加载更多合集视频';}catch(e){if(turn===generation)toast(e.message);}finally{collectionBusy=false;button.disabled=false;}
}
document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.videoAction)videoAction(b.dataset.videoAction);else if(b.hasAttribute('data-close-action'))closeAction();else if(b.id==='collection-more')moreCollection();else if(b.hasAttribute('data-login')&&$('action-dialog').open)closeAction();});
document.addEventListener('DOMContentLoaded',()=>{$('action-dialog').addEventListener('cancel',e=>{if(actionBusy)e.preventDefault();});});
