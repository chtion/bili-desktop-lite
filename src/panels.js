'use strict';
let dynamicItems = [];
function personalHeader(title, subtitle) {
  $('content').innerHTML = heading(title,subtitle) + '<div id="personal-area"><div class="account-loading"><span class="spinner"></span>正在加载…</div></div>';
}
async function loadPersonal() {
  const turn=generation;
  const name=route.name;
  personalHeader(name==='favorites'?'我的收藏夹':name==='dynamics'?'我的动态':'个人空间', name==='favorites'?'与 B站账号同步的收藏内容':name==='dynamics'?'记录分享的每一份热爱':'在这里认识一个有趣的人');
  try {
    if(name==='favorites') {
      const data=await window.bili.api('favorite-folders'); if(turn!==generation)return false;
      if(!data.folders.length) { $('personal-area').innerHTML=empty('还没有收藏夹','在 B站收藏视频后，这里会同步展示。');return true; }
      route.folder=data.folders.some(f=>f.id===route.folder)?route.folder:data.folders[0].id;
      $('personal-area').innerHTML=`<div class="folder-tabs">${data.folders.map(f=>`<button data-folder="${f.id}" class="${f.id===route.folder?'active':''}">${icon('heart')}<span>${esc(f.title)}</span><small>${f.count}</small></button>`).join('')}</div><div id="feed-area">${skeleton()}</div>`;
      return fetchList();
    }
    if(name==='profile') {
      const p=await window.bili.api('profile',{mid:route.mid});if(turn!==generation)return false;
      route.mid=p.mid;
      route.author=p.name; route.avatar=p.avatar;
      $('personal-area').innerHTML=`<section class="space-profile"><span class="space-avatar">${p.avatar?`<img src="${esc(image(p.avatar))}" alt="">`:icon('user')}</span><div><h2>${esc(p.name)}<small>Lv.${p.level}</small></h2><p>${esc(p.sign||'还没有填写简介。')}</p><div class="space-stats"><span><b>${number(p.following)}</b> 关注</span><span><b>${number(p.followers)}</b> 粉丝</span><span><b>${number(p.videos)}</b> 投稿</span><span>UID ${p.mid}</span></div></div></section><div class="section-heading"><h2>视频投稿</h2></div><div id="feed-area">${skeleton()}</div>`;
      return fetchList();
    }
    $('personal-area').innerHTML='<div id="dynamic-list"></div>';
    dynamicItems=[];return fetchDynamics();
  } catch(e) {
    if(turn===generation) $('personal-area').innerHTML=empty('内容暂时无法加载',e.message,'user')+'<div class="empty-action"><button class="primary-button" data-refresh>重试</button></div>';
    return false;
  }
}
async function fetchDynamics(append=false) {
  const turn=generation;
  if(loadingMore)return false; loadingMore=true;
  if($('dynamic-more'))$('dynamic-more').disabled=true;
  try {
    const d=await window.bili.api('dynamics',{offset:append?route.offset:''}); if(turn!==generation)return false;
    route.offset=d.offset;
    dynamicItems=append?[...dynamicItems,...d.items.filter(v=>!dynamicItems.some(o=>o.id===v.id))]:d.items;
    const items=dynamicItems;
    remember(items.filter(v=>v.video?.bvid).map(v=>v.video));
    $('dynamic-list').innerHTML=items.length?items.map(v=>`<article class="dynamic-card"><div class="dynamic-author">${v.avatar?`<img src="${esc(image(v.avatar))}" alt="">`:icon('user')}<strong>${esc(v.name)}</strong><small>${esc(v.time)}</small></div><p>${esc(v.text||(!v.video&&!v.images.length?'这条动态暂不支持完整展示。':''))}</p>${v.video?.bvid?compactCard(v.video):''}${v.images.length?`<div class="dynamic-images">${v.images.map(i=>`<img loading="lazy" src="${esc(image(i))}" alt="动态图片">`).join('')}</div>`:''}</article>`).join(''):empty('还没有发布动态','你的动态会展示在这里。','user');
    if(d.more)$('dynamic-list').insertAdjacentHTML('beforeend','<div class="load-more"><button id="dynamic-more" class="secondary-button">加载更多</button></div>');
    return true;
  }catch(e){if(turn===generation){if(append)toast(e.message);else $('dynamic-list').innerHTML=empty('动态暂时无法加载',e.message,'refresh');}return false;}
  finally{if(turn===generation){loadingMore=false;if($('dynamic-more'))$('dynamic-more').disabled=false;}}
}
let watchTab='related', commentPage=0, commentItems=[], commentsBusy=false, commentMore=false, commentSort='hot';
function chooseWatchTab(tab) {
  watchTab=tab;
  document.querySelectorAll('.watch-tabs [data-watch-tab]').forEach(b=>{b.classList.toggle('active',b.dataset.watchTab===tab);b.setAttribute('aria-selected',String(b.dataset.watchTab===tab));});
  for(const name of ['intro','related','comments','parts']) $(`${name}-panel`).hidden=name!==tab;
  if(tab==='comments' && commentPage===0 && !commentsBusy)fetchComments();
}
async function fetchComments(append=false) {
  const turn=generation;
  if(!activeVideo || commentsBusy)return;commentsBusy=true;
  if($('comments-more'))$('comments-more').disabled=true;
  try {
    const d=await window.bili.api('comments',{aid:activeVideo.aid,page:append?commentPage+1:1,sort:commentSort});
    if(turn!==generation)return;
    commentPage=append?commentPage+1:1;
    const fresh=d.items.filter(c=>!commentItems.some(o=>o.id===c.id));
    commentMore=d.more && (!append || fresh.length>0);
    commentItems=append?[...commentItems,...fresh]:d.items;
    $('comments-panel').innerHTML=`<div class="comment-toolbar"><p class="pane-caption">${number(d.total)} 条评论</p><button data-comment-sort="hot" aria-pressed="${commentSort==='hot'}">最热</button><button data-comment-sort="new" aria-pressed="${commentSort==='new'}">最新</button></div>`+(commentItems.length?commentItems.map(c=>commentCard(c)).join(''):'<p class="muted">暂时没有评论。</p>')+(commentMore?'<button id="comments-more" class="secondary-button">更多评论</button>':'');
  }catch(e){if(turn===generation){if(append)toast(e.message);else $('comments-panel').innerHTML=`<p class="pane-caption">${esc(e.message)}</p><button id="comments-retry" class="secondary-button">重新加载评论</button>`;}}
  finally{if(turn===generation){commentsBusy=false;if($('comments-more'))$('comments-more').disabled=false;}}
}
function commentCard(c,nested=false) {
  const time=c.time?new Date(c.time*1000).toLocaleDateString('zh-CN'):'';
  return `<article class="comment-card"><button data-user-space="${c.mid}" class="comment-avatar" aria-label="打开 ${esc(c.name)} 的空间">${c.avatar?`<img src="${esc(image(c.avatar))}" alt="">`:icon('user')}</button><div><button data-user-space="${c.mid}" class="comment-name">${esc(c.name)}</button>${c.pinned?'<span class="comment-pinned">置顶</span>':''}<p>${esc(c.text)}</p><small>${esc(time)} ${number(c.likes)} 赞</small>${!nested&&c.replies?`<button class="comment-reply-button" data-reply-root="${esc(c.id)}" data-reply-page="1">查看 ${number(c.replies)} 条回复</button><div class="comment-thread"></div>`:''}</div></article>`;
}
async function fetchReplies(button) {
  if(!activeVideo||button.disabled)return;
  const turn=generation,page=Number(button.dataset.replyPage);
  button.disabled=true;
  try {
    const result=await window.bili.api('comments',{aid:activeVideo.aid,root:button.dataset.replyRoot,page});
    if(turn!==generation||!button.isConnected)return;
    button.nextElementSibling.insertAdjacentHTML('beforeend',result.items.map(c=>commentCard(c,true)).join(''));
    button.dataset.replyPage=String(page+1);button.hidden=!result.more;button.textContent='加载更多回复';
  } catch(error){if(turn===generation)toast(error.message);}
  finally{button.disabled=false;}
}
function startPart(part) {
  const turn=generation;
  document.querySelectorAll('[data-part]').forEach(b=>b.classList.toggle('active',Number(b.dataset.part)===part));
  route.part=part;
  $('play-status').textContent='正在连接视频…';$('play-status').hidden=false;
  NativePlayer.start($('player-slot'),route.bvid,part,message=>{
    if(turn!==generation)return;
    $('play-status').textContent=message;$('play-status').hidden=!message;
  },route.episodeId,activeVideo);
}
