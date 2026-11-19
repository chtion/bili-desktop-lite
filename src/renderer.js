'use strict';
const $ = (id) => document.getElementById(id);
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const image = (url) => url ? `bili-app://image/?url=${encodeURIComponent(url)}` : '';
const number = (n) => n >= 1e8 ? `${(n / 1e8).toFixed(1)}亿` : n >= 1e4 ? `${(n / 1e4).toFixed(1)}万` : String(n || 0);
const duration = (n) => typeof n === 'number' ? `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}` : n;
const storage = {
  read(key, fallback) { try { return JSON.parse(localStorage.getItem(`bili-lite:${key}`)) ?? fallback; } catch { return fallback; } },
  write(key, value) { try { localStorage.setItem(`bili-lite:${key}`, JSON.stringify(value)); } catch { toast('本机存储空间不足，暂时无法保存。'); } }
};
let saved = storage.read('saved', []).filter((v) => /^BV\w{10}$/.test(v.bvid)).slice(0, 500);
let history = storage.read('history', []).filter((v) => v.episodeId||/^BV\w{10}$/.test(v.bvid)).slice(0, 100);
let theme = storage.read('theme', 'system');
let route = { name: 'home', category: 0, keyword: '', order: 'totalrank', page: 1 };
let previousRoute = { ...route };
let videos = new Map();
let activeVideo;
let generation = 0;
let currentItems = [];
let feedSource='guest',feedNote='';
let more = false;
let loadingMore = false;
let toastTimer;
let accountBusy = false;
let accountRefreshPending = false;
let accountState = null;
let accountError = '';
let peopleItems = [];
let peopleLoading = false;
let peopleMore = false;
let lastScroller;
const systemTheme = matchMedia('(prefers-color-scheme: dark)');
const categories = [[0, '推荐'], [1, '动画'], [3, '音乐'], [4, '游戏'], [36, '知识'], [188, '科技'], [160, '生活'], [211, '美食']];

document.querySelectorAll('[data-icon]').forEach((el) => { el.innerHTML = icon(el.dataset.icon); });
function applyTheme(mode) {
  theme = ['light', 'dark', 'system'].includes(mode) ? mode : 'system';
  const actual = theme === 'system' ? (systemTheme.matches ? 'dark' : 'light') : theme;
  document.documentElement.dataset.theme = actual;
  $('theme-toggle').innerHTML = icon(actual === 'dark' ? 'sun' : 'moon');
  document.querySelectorAll('[data-theme-mode]').forEach((button) => {
    button.classList.toggle('selected', button.dataset.themeMode === theme);
    button.setAttribute('aria-pressed', String(button.dataset.themeMode === theme));
  });
  storage.write('theme', theme);
  window.bili.command('theme', theme);
}
systemTheme.addEventListener('change', () => { if (theme === 'system') applyTheme(theme); });
$('theme-toggle').addEventListener('click', () => applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));
document.querySelectorAll('[data-theme-mode]').forEach((button) => button.addEventListener('click', () => applyTheme(button.dataset.themeMode)));
applyTheme(theme);
function setSidebar(collapsed) {
  document.documentElement.classList.toggle('sidebar-collapsed', collapsed);
  $('sidebar-toggle').setAttribute('aria-expanded', String(!collapsed));
  $('sidebar-toggle').setAttribute('aria-label', collapsed ? '展开侧栏' : '收起侧栏');
  $('sidebar-toggle').title = collapsed ? '展开侧栏' : '收起侧栏';
  storage.write('sidebar-collapsed', collapsed);

}
document.querySelectorAll('.nav-item').forEach((button) => {
  const label = button.querySelector('span:nth-child(2)').textContent;
  button.title = label; button.setAttribute('aria-label', label);
});
setSidebar(storage.read('sidebar-collapsed', false) === true);
$('sidebar-toggle').addEventListener('click', () => setSidebar(!document.documentElement.classList.contains('sidebar-collapsed')));
function updateBackTop() {
  const scrollers = [$('workspace'), $('video-detail'), document.querySelector('.related'), document.querySelector('.watch-main')].filter(Boolean);
  if (!lastScroller?.isConnected || lastScroller.scrollTop <= 320) lastScroller = scrollers.find((el) => el.scrollTop > 320);
  $('back-top').hidden = !lastScroller || lastScroller.scrollTop <= 320;
}
$('workspace').addEventListener('scroll', (event) => {
  lastScroller = event.target; updateBackTop();
}, true);
$('back-top').addEventListener('click', () => {
  lastScroller?.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
});
function toast(message) {
  clearTimeout(toastTimer); $('toast').textContent = message; $('toast').hidden = false;
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, 2600);
}
function updateSaved() {
  $('saved-count').textContent = saved.length;
  document.querySelectorAll('[data-save]').forEach((button) => {
    const exists = saved.some((v) => v.bvid === button.dataset.save);
    button.classList.toggle('is-saved', exists);
    button.setAttribute('aria-pressed', String(exists));
    button.title = exists ? '移出本地收藏' : '加入本地收藏';
    button.innerHTML = icon('heart') + (button.classList.contains('watch-save') ? (exists ? '已收藏' : '本地收藏') : '');
  });
}
function toggleSave(bvid) {
  const exists = saved.some((v) => v.bvid === bvid);
  if (exists) saved = saved.filter((v) => v.bvid !== bvid);
  else if (videos.has(bvid)) saved = [videos.get(bvid), ...saved].slice(0, 500);
  storage.write('saved', saved); updateSaved();
  toast(exists ? '已移出本地收藏' : '已加入本地收藏');
  if (route.name === 'saved') renderLibrary();
}
function remember(items) { items.forEach((v) => videos.set(v.bvid, v)); }
function cover(v, extra = '') { return v.cover ? `<img ${extra} src="${esc(image(v.cover))}" alt="" loading="lazy">` : `<span class="no-cover">${icon('video')}</span>`; }
function card(v, index) {
  return `<article class="video-card"><button class="cover-button" data-watch="${esc(v.bvid)}" aria-label="播放 ${esc(v.title)}">${cover(v)}${route.name === 'ranking' ? `<span class="rank-badge">${index + 1}</span>` : ''}<span class="cover-shade"></span><span class="cover-stats"><span>${icon('play')}${number(v.views)}</span><span>${icon('comment')}${number(v.danmaku)}</span></span><span class="duration">${esc(duration(v.duration))}</span><span class="hover-play">${icon('play')}</span></button><button class="card-save" data-save="${esc(v.bvid)}" aria-label="收藏 ${esc(v.title)}">${icon('heart')}</button><button class="video-title" data-watch="${esc(v.bvid)}" title="${esc(v.title)}">${esc(v.title)}</button><div class="video-author"><span class="up-tag">UP</span><span>${esc(v.author)}</span><span class="category-tag">${esc(v.reason||v.category)}</span></div></article>`;
}
function compactCard(v) { return `<button class="compact-card" data-watch="${esc(v.bvid)}"><span class="compact-cover">${cover(v)}<span class="duration">${esc(duration(v.duration))}</span></span><span class="compact-copy"><strong>${esc(v.title)}</strong><small>${esc(v.author)}</small><small>${icon('play')}${number(v.views)} 次观看</small></span></button>`; }
function skeleton() { return `<div class="skeleton-grid">${Array.from({ length: 8 }, () => '<div class="skeleton"><div></div><p></p><small></small></div>').join('')}</div>`; }
function heading(title, subtitle) {
  return `<div class="page-heading"><div><h1>${esc(title)}</h1>${subtitle ? `<p>${esc(subtitle)}</p>` : ''}</div><button class="subtle-button" data-refresh>${icon('refresh')}刷新</button></div>`;
}
function tabs() { return `<div class="category-tabs" aria-label="内容分区">${categories.map(([id, name]) => `<button data-category="${id}" class="${route.category === id ? 'active' : ''}">${name}</button>`).join('')}</div>`; }
function hero(items) {
  if (!items.length) return '';
  const v = items[0];
  return `<section class="hero-layout" aria-label="推荐精选"><button class="hero" data-watch="${esc(v.bvid)}">${cover(v)}<span class="hero-gradient"></span><span class="hero-copy"><span class="hero-kicker">${icon('spark')}此刻，值得一看</span><strong>${esc(v.title)}</strong><span class="hero-meta">${esc(v.author)}<span>·</span>${number(v.views)} 次观看</span><span class="hero-play">${icon('play')}立即观看</span></span><span class="hero-index">01 <i>/ 03</i></span></button><div class="spotlight"><div class="spotlight-head"><span>${icon('fire')}为你发现</span><small>推荐速览</small></div>${items.slice(1, 3).map(compactCard).join('')}</div></section>`;
}
function listBase() {
  const ranking = route.name === 'ranking';
  $('content').innerHTML = `<div class="browse-toolbar"><h1>${ranking ? '热门榜单' : '发现'}</h1>${tabs()}<button class="icon-button refresh-feed" data-refresh title="刷新内容" aria-label="刷新内容">${icon('refresh')}</button></div><div id="feed-area">${skeleton()}</div>`;
}
function renderItems() {
  const homeHero = route.name === 'home' && route.category === 0;
  const display = currentItems;
  $('feed-area').innerHTML = (homeHero ? hero(currentItems) + `<div class="section-heading"><h2>${icon('video')}${feedSource==='account'?'为你推荐':feedSource==='popular'?'热门视频':'发现好内容'}<small>${esc(feedNote)}</small></h2><span class="live-label" id="feed-source"><i></i>${feedSource==='account'?'账号推荐':feedSource==='popular'?'热门备用':'游客推荐'}</span></div>` : '') + (display.length ? `<div class="video-grid">${display.map(card).join('')}</div>` : empty('还没有找到相关视频', '换个关键词，再发现一点新鲜事。', 'search')) + (more ? '<div class="load-more"><button id="load-more" class="secondary-button">再看一些 ↓</button></div>' : display.length ? '<p class="list-end">已经看到这里了，换个分区再逛逛吧。</p>' : '');
  updateSaved();
}
function empty(title, message, symbol = 'heart') { return `<div class="empty-state"><span>${icon(symbol)}</span><h2>${esc(title)}</h2><p>${esc(message)}</p></div>`; }
async function fetchList(append = false) {
  const turn = generation;
  const expected = { ...route, page: append ? route.page + 1 : route.page || 1 };
  if (append) { loadingMore = true; $('load-more').textContent = '正在加载…'; $('load-more').disabled = true; }
  try {
    const method = ({ranking:'ranking',favorites:'favorites',profile:'uploads'})[route.name] || 'feed';
    let data = await window.bili.api(method, expected);
    if (turn !== generation) return;
    if (!append && method === 'feed' && !expected.category && expected.page > 1 && !data.items.length) {
      expected.page=1; data=await window.bili.api(method,expected);
    }
    if (turn !== generation) return;
    if (append && method==='feed' && data.source && data.source!==feedSource) {
      toast('推荐来源已变化，点击刷新可查看新一批。');
      $('load-more').textContent = '再看一些 ↓';
      $('load-more').disabled = false;
      return false;
    }
    route.page = expected.page; route.total = data.total;
    if(method==='feed'){feedSource=data.source||'category';feedNote=data.note||'';}
    if(route.name==='home' && !route.category)homeBatch=expected.page;
    if(route.name==='profile') data.items=data.items.map(v=>({...v,author:v.author||route.author,avatar:v.avatar||route.avatar}));
    currentItems = append ? [...currentItems, ...data.items.filter((v) => !currentItems.some((old) => old.bvid === v.bvid))] : data.items;
    more = data.more; remember(currentItems); renderItems(); return true;
  } catch (error) {
    if (turn !== generation) return;
    if (append) { toast(error.message); $('load-more').textContent = '重试加载'; $('load-more').disabled = false; }
    else if (currentItems.length && refreshing) toast(error.message);
    else $('feed-area').innerHTML = empty('内容暂时没能加载', error.message, 'refresh') + '<div class="empty-action"><button class="primary-button" data-refresh>重新试试</button></div>';
  } finally { if (turn === generation) loadingMore = false; }
}
function renderLibrary() {
  const isHistory = route.name === 'history';
  const items = isHistory ? history : saved;
  remember(items);
  $('content').innerHTML = heading(isHistory ? '播放历史' : '本地收藏', isHistory ? '点击视频，从上次的进度继续。' : '把喜欢的内容收好，想看时随时回来。') + `<div class="library-note">${icon(isHistory ? 'clock' : 'heart')}<span>${items.length} 个视频 · ${isHistory?'本机播放记录':'仅保存在这台电脑'}</span></div>` + (items.length ? `<div class="video-grid library-grid">${items.map(isHistory?historyCard:card).join('')}</div>` : empty(isHistory ? '还没有播放记录' : '收藏你的第一份喜欢', isHistory ? '开始播放后，进度会自动保存在这里。' : '视频卡片右上角的爱心，可以帮你记住喜欢的内容。', isHistory ? 'history' : 'heart'));
  updateSaved();
}
function historyCard(v) {
  const action=v.episodeId?`data-episode="${v.episodeId}"`:`data-watch="${esc(v.bvid)}"`;
  const progress=v.total?Math.min(100,Math.max(0,v.time/v.total*100)):0;
  const label=v.done?'已看完':v.time?`${v.part>1?'P'+v.part+' · ':''}看到 ${duration(v.time)} / ${duration(v.total)}`:'打开视频';
  return `<article class="video-card"><button class="cover-button" ${action} aria-label="继续播放 ${esc(v.title)}">${cover(v)}<span class="history-progress"><i style="width:${progress}%"></i></span></button><button class="video-title" ${action}>${esc(v.title)}</button><div class="video-author">${esc(label)}</div></article>`;
}
async function navigate(name, extra = {}, options = {}) {
  if(route.name==='swipe')StreamFeed.leave();
  Extensions.leave();
  rememberRoute({name,category:0,keyword:'',order:'totalrank',...extra},options.replace);
  setWebFullscreen(false);window.bili.command('play-state',false);$('pin-window').hidden=true;
  if (!options.keepAccount) closeAccount(false);
  $('action-dialog').close();
  generation++; NativePlayer.destroy(); activeVideo = null; currentItems = []; loadingMore = false;
  route = { name, category: 0, keyword: '', order: 'totalrank', page: 1, ...extra };
  document.documentElement.dataset.route=name;
  setSearchExpanded(name==='home');
  updateBackButton();
  $('search').value = name === 'search' ? route.keyword : '';
  $('workspace').classList.remove('playing'); $('workspace').scrollTop = 0;
  lastScroller = null; $('back-top').hidden = true;
  document.querySelectorAll('.nav-item').forEach((button) => { button.classList.toggle('active', button.dataset.route === name); button.setAttribute('aria-current', button.dataset.route === name ? 'page' : 'false'); });
  if (['saved', 'history'].includes(name)) { renderLibrary(); return true; }
  if (['following', 'followers'].includes(name)) { peopleBase(); return fetchPeople(); }
  if (['favorites','profile','dynamics'].includes(name)) return loadPersonal();
  if(name==='bangumi')return loadShows();
  if(name==='anime'){route.order=extra.order||'hot';return loadAnime();}
  if(name==='search')return loadSearch();
  if(name==='season')return loadSeason();
  if(name==='swipe'){window.bili.command('play-state',true);$('pin-window').hidden=false;return StreamFeed.mount();}
  if(name==='hongguo'||name==='browser')return Extensions.mount(name);
  listBase(); return fetchList();
}
async function watch(bvid, options = {}) {
  if(route.name==='swipe')StreamFeed.leave();
  Extensions.leave();
  if(!options.episodeId&&videos.get(bvid)?.episodeId)options={...options,episodeId:videos.get(bvid).episodeId};
  rememberRoute({name:'watch',bvid,episodeId:options.episodeId},options.replace);
  setWebFullscreen(false);window.bili.command('play-state',true);$('pin-window').hidden=false;
  closeAccount(false);$('action-dialog').close(); lastScroller = null; $('back-top').hidden = true;
  const turn = ++generation;
  if (route.name !== 'watch') previousRoute = { ...route };
  route = { name: 'watch', bvid, episodeId:options.episodeId, part:options.part||1 };updateBackButton();
  document.documentElement.dataset.route='watch';
  setSearchExpanded(false);
  NativePlayer.destroy(); activeVideo=null; setSidebar(true);
  commentPage=0; commentItems=[]; commentsBusy=false; commentSort='hot';watchTab='related';
  $('workspace').classList.add('playing'); $('workspace').scrollTop = 0;
  $('content').innerHTML = '<div class="watch-heading"><span>正在观看</span><button id="toggle-web-mode" class="subtle-button" aria-pressed="false">'+icon('expand')+'网页全屏</button><button id="retry-stream" class="subtle-button">'+icon('refresh')+'重试播放</button></div><div class="watch-layout"><section class="watch-main"><div class="player-frame"><div id="player-slot" class="player-slot"></div><div id="play-status" class="play-status">正在准备播放器…</div></div><div id="video-detail" class="video-detail"><div class="skeleton"><p></p><small></small></div></div></section><button id="toggle-details" class="details-toggle" aria-controls="watch-side" aria-expanded="true" aria-label="收起右侧详情"></button><aside class="watch-side" id="watch-side"><div class="watch-tabs" role="tablist"><button data-watch-tab="intro" role="tab" aria-selected="false" hidden>简介</button><button data-watch-tab="related" class="active" role="tab" aria-selected="true">推荐</button><button data-watch-tab="comments" role="tab" aria-selected="false">评论</button><button data-watch-tab="parts" role="tab" aria-selected="false">分集</button></div><div class="related"><section id="intro-panel" hidden><div class="intro-recommendations"><h3>接下来看看</h3><div id="intro-related-list"></div></div></section><section id="related-panel"><p class="pane-caption">接下来看看</p><div id="related-list">'+skeleton()+'</div></section><section id="comments-panel" hidden><div class="account-loading"><span class="spinner"></span>正在加载评论…</div></section><section id="parts-panel" hidden></section></div></aside></div>';
  document.querySelector('.watch-heading').insertAdjacentHTML('beforeend','<button id="pin-playback" class="subtle-button" aria-pressed="false">'+icon('pin')+'置顶</button>');
  $('pin-playback').addEventListener('click',()=>window.bili.command('pin'));
  updatePinState({pinned:$('pin-window').getAttribute('aria-pressed')==='true'});
  try {
    await preferencesReady;if(turn!==generation)return;
    setRightPanel(appPreferences.rightPanel);setWebFullscreen(options.fullscreen??appPreferences.webFullscreen);
    const v = await window.bili.api('video', { bvid,episodeId:options.episodeId });
    if (turn !== generation) return;
    activeVideo=v;route.bvid=v.bvid;remember([v]);$('window-video-title').textContent=v.title;
    const last=PlaybackProgress.entry(v.bvid,v.episodeId);
    if(!options.part&&last?.part&&v.pages.some(p=>p.page===last.part))route.part=last.part;
    renderVideoDetail(v);
    if(v.kind!=='episode')window.bili.api('video-extra',{bvid:v.bvid}).then(data=>{if(turn===generation)renderVideoExtra(data);}).catch(()=>{});
    updateSaved(); startPart(route.part,options.resumeAt);
    window.bili.api('related',{bvid:v.bvid}).then(data=>{if(turn===generation){remember(data.items);$('related-list').innerHTML=data.items.length?data.items.map(compactCard).join(''):'<p class="muted">暂时没有相关推荐。</p>';$('intro-related-list').innerHTML=$('related-list').innerHTML;}}).catch(()=>{if(turn===generation)$('related-list').innerHTML='<p class="muted">推荐暂时未能加载，稍后再来看看。</p>';});
  }catch(error){if(turn===generation){$('play-status').textContent=error.message;$('video-detail').innerHTML='<button class="primary-button" id="retry-video">重新加载</button>';}}
}
let refreshing=false;
async function refreshRoute() {
  if(refreshing)return;
  if(route.name==='swipe'){StreamFeed.reset();navigate('swipe',{},{replace:true});return;}
  if(route.name==='hongguo'||route.name==='browser'){Extensions.refresh();return;}
  if(route.name==='watch'){watch(route.bvid,{episodeId:route.episodeId,part:route.part,fullscreen:webMode,replace:true});return;}
  refreshing=true;
  document.querySelectorAll('[data-refresh]').forEach(b=>{b.disabled=true;b.classList.add('refreshing');});
  const turn=++generation; loadingMore=false;
  const rotate=route.name==='home' && !route.category;
  try {
    let ok;
    if(['home','ranking'].includes(route.name)) {
      const oldPage=route.page;
      route.page=rotate?(route.page>=100?1:route.page+1):1;
      ok=await fetchList();
      if(!ok && generation===turn)route.page=oldPage;
      if(ok)$('workspace').scrollTo({top:0,behavior:'smooth'});
    } else ok=await navigate(route.name,{...route,page:1});
    if(ok)toast(rotate?'已换一批内容':'已重新获取最新内容');
  }finally{refreshing=false;document.querySelectorAll('[data-refresh]').forEach(b=>{b.disabled=false;b.classList.remove('refreshing');});}
}
async function updateAccount() {
  if (accountBusy) { accountRefreshPending = true; return; }
  accountBusy = true;
  try {
    const account = await window.bili.api('account');
    const previousMid = accountState?.mid;
    accountState = account; accountError = '';
    $('account-name').textContent = account.loggedIn ? account.name : '登录 B站';
    $('account-caption').textContent = account.loggedIn ? (account.vip ? '大会员 · 查看账号' : `Lv.${account.level} · 查看账号`) : '登录后查看个人资料';
    document.querySelector('#account .avatar').innerHTML = account.avatar ? `<img src="${esc(image(account.avatar))}" alt="">` : icon('user');
    $('account').title = account.loggedIn ? `${account.name} · 账号信息` : '登录 B站';
    if(previousMid!==account.mid){
      if(previousMid!==undefined){StreamFeed.reset();if(route.name==='swipe')navigate('swipe',{},{replace:true});}
      if(['following','followers','favorites','dynamics','bangumi'].includes(route.name))navigate(route.name);
      else if(route.name==='home' && !route.category)navigate('home',{page:1},{replace:true,keepAccount:true});
      else if(route.name==='watch'&&activeVideo)loadVideoState();
    }
  } catch (error) {
    accountError = error.message;
    if (!accountState) $('account-caption').textContent = '连接失败，点击重试';
  }
  finally {
    accountBusy = false;
    if (!$('account-panel').hidden) renderAccount();
    if (accountRefreshPending) { accountRefreshPending = false; queueMicrotask(updateAccount); }
  }
}
function accountStat(value) { return value === null || value === undefined ? '—' : number(value); }
function renderAccount() {
  const a = accountState;
  const panelHeader = `<div class="account-panel-header"><span>我的账号</span><button class="icon-button" data-close-account aria-label="关闭账号面板">${icon('close')}</button></div>`;
  let html = panelHeader;
  if (!a && accountBusy) html += '<div class="account-loading"><span class="spinner"></span>正在加载账号信息…</div>';
  else if (a?.loggedIn) {
    html += `<div class="profile-summary"><span class="profile-avatar">${a.avatar ? `<img src="${esc(image(a.avatar))}" alt="">` : icon('user')}</span><div><strong>${esc(a.name)}</strong><small>UID ${esc(a.mid)}</small><span class="profile-badges"><span>Lv.${esc(a.level)}</span>${a.vip ? '<span>大会员</span>' : ''}</span></div></div><div class="profile-stats"><button data-people="following"><strong>${accountStat(a.following)}</strong><span>关注</span></button><button data-people="followers"><strong>${accountStat(a.followers)}</strong><span>粉丝</span></button><button data-account-page="dynamics"><strong>${accountStat(a.dynamics)}</strong><span>动态</span></button></div><div class="account-links"><button data-account-page="profile">${icon('user')}个人空间${icon('arrow')}</button><button data-account-page="bangumi">${icon('video')}我的追番${icon('arrow')}</button><button data-account-page="favorites">${icon('heart')}B站收藏夹${icon('arrow')}</button><button data-login>${icon('users')}账号管理 / 切换账号${icon('arrow')}</button></div><div class="account-meta"><span>硬币 ${a.coins === null ? '—' : esc(a.coins)}</span><button data-refresh-account>${icon('refresh')}刷新资料</button></div>`;
  } else if (a) {
    html += `<div class="guest-profile"><span class="profile-avatar">${icon('user')}</span><h2>登录你的 B站账号</h2><p>查看个人资料、关注和粉丝，<br>在这里接着探索喜欢的内容。</p><button class="primary-button" data-login>登录 B站${icon('arrow')}</button></div>`;
  }
  if (accountError) html += `<div class="account-error"><p>${esc(accountError)}</p><button class="subtle-button" data-refresh-account>${icon('refresh')}重新加载</button></div>`;
  if (a?.loggedIn && a.following === null) html += '<p class="stats-unavailable">关注等统计暂时不可用，稍后刷新资料再试。</p>';
  $('account-content').innerHTML = html;
}
function closeAccount(restoreFocus = true) {
  if ($('account-panel').hidden) return;
  $('account-panel').hidden = true;
  $('account').setAttribute('aria-expanded', 'false');
  window.bili.command('overlay', false);
  if (restoreFocus) $('account').focus();
}
function openAccount() {
  $('account-panel').hidden = false;
  $('account').setAttribute('aria-expanded', 'true');
  window.bili.command('overlay', true);
  updateAccount(); renderAccount();
  $('account-panel').focus();
}
$('account').addEventListener('click', () => $('account-panel').hidden ? openAccount() : closeAccount());
document.addEventListener('pointerdown', (event) => { if (!event.target.closest('#account-panel, #account')) closeAccount(false); });
document.addEventListener('keydown', (event) => {
  if ($('account-panel').hidden) return;
  if (event.key === 'Escape') { event.preventDefault(); closeAccount(); }
  if (event.key === 'Tab') {
    const focusable = [...$('account-panel').querySelectorAll('button:not(:disabled)')];
    const first = focusable[0], last = focusable.at(-1);
    if (event.shiftKey && [first, $('account-panel')].includes(document.activeElement)) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }
});
function peopleBase() {
  const followers = route.name === 'followers';
  $('content').innerHTML = heading(followers ? '我的粉丝' : '我的关注', followers ? '关注你的人，和你一起发现更多。' : '你关注的 UP 主，都在这里。') + `<div class="people-tabs"><button data-people="following" class="${followers ? '' : 'active'}">关注</button><button data-people="followers" class="${followers ? 'active' : ''}">粉丝</button></div><div id="people-area"><div class="account-loading"><span class="spinner"></span>正在加载…</div></div>`;
}
function personCard(user) {
  return `<article class="person-card"><button data-user-space="${user.mid}" class="person-avatar" aria-label="打开 ${esc(user.name)} 的空间">${user.avatar ? `<img loading="lazy" src="${esc(image(user.avatar))}" alt="">` : icon('user')}</button><div><button data-user-space="${user.mid}" class="person-name">${esc(user.name)}</button><p>${esc(user.official || user.sign || '这位 UP 主还没有填写简介。')}</p></div><button class="icon-button" data-user-space="${user.mid}" title="打开个人空间" aria-label="打开个人空间">${icon('arrow')}</button></article>`;
}
async function fetchPeople(append = false) {
  if (append && peopleLoading) return;
  const turn = generation;
  const page = append ? route.page + 1 : 1;
  peopleLoading = true;
  if (append) { $('people-more').disabled = true; $('people-more').textContent = '正在加载…'; }
  try {
    const result = await window.bili.api(route.name, { page });
    if (turn !== generation) return;
    route.page = page; peopleMore = result.more;
    peopleItems = append ? [...peopleItems, ...result.items.filter((u) => !peopleItems.some((old) => old.mid === u.mid))] : result.items;
    $('people-area').innerHTML = `<p class="people-total">共 ${number(result.total)} 位</p>` + (peopleItems.length ? `<div class="people-grid">${peopleItems.map(personCard).join('')}</div>` : empty('这里暂时还没有人', route.name === 'following' ? '到 B站关注喜欢的 UP 主后，可以回来刷新。' : '继续分享喜欢的内容，让更多人发现你。', 'users')) + (peopleMore ? '<div class="load-more"><button id="people-more" class="secondary-button">加载更多</button></div>' : ''); return true;
  } catch (error) {
    if (turn !== generation) return;
    if (append) { toast(error.message); $('people-more').disabled = false; $('people-more').textContent = '重试加载'; }
    else $('people-area').innerHTML = empty('暂时无法加载列表', error.message, 'users') + `<div class="empty-action"><button class="primary-button" data-refresh>重新加载</button></div>`;
  } finally { if (turn === generation) peopleLoading = false; }
}
function setSearchExpanded(expanded,focus=false) {
  $('search-form').classList.toggle('search-compact',!expanded);
  $('search-toggle').setAttribute('aria-expanded',String(expanded));
  $('search-fields').inert=!expanded;
  if(focus){$('search').focus();$('search').select();}
}
$('search-toggle').addEventListener('click',()=>setSearchExpanded(true,true));
$('search-form').addEventListener('focusout',()=>{
  queueMicrotask(()=>{if(route.name!=='home'&&!$('search-form').contains(document.activeElement))setSearchExpanded(false);});
});
$('search-form').addEventListener('submit', (event) => {
  event.preventDefault(); const keyword = $('search').value.trim(); if (!keyword) return;
  const match = keyword.match(/^(?:https:\/\/(?:www\.)?bilibili\.com\/video\/)?(BV[1-9A-HJ-NP-Za-km-z]{10})(?:[/?#].*)?$/);
  $('search').blur(); if (match) watch(match[1]); else navigate('search', { keyword });
});
document.addEventListener('click', (event) => {
  const button = event.target.closest('button'); if (!button) return;
  if (button.hasAttribute('data-close-account')) closeAccount();
  else if (button.hasAttribute('data-refresh-account')) updateAccount();
  else if (button.hasAttribute('data-login')) { closeAccount(); window.bili.command('login'); }
  else if (button.dataset.people) navigate(button.dataset.people);
  else if (button.dataset.accountPage) navigate(button.dataset.accountPage);
  else if (button.dataset.userSpace) navigate('profile',{mid:Number(button.dataset.userSpace)});
  else if (button.dataset.folder) navigate('favorites',{folder:Number(button.dataset.folder)});
  else if (button.id==='dynamic-more') fetchDynamics(true);
  else if (button.dataset.watchTab) chooseWatchTab(button.dataset.watchTab);
  else if (button.dataset.part) startPart(Number(button.dataset.part));
  else if (button.dataset.commentSort && !commentsBusy && commentSort!==button.dataset.commentSort) { commentSort=button.dataset.commentSort;commentPage=0;commentItems=[];fetchComments(); }
  else if (button.dataset.replyRoot) fetchReplies(button);
  else if (button.hasAttribute('data-chapter') && NativePlayer.current?.art) NativePlayer.current.art.currentTime=Number(button.dataset.chapter);
  else if (button.dataset.videoTag) navigate('search',{keyword:button.dataset.videoTag});
  else if (button.id==='comments-more') fetchComments(true);
  else if (button.id==='comments-retry') fetchComments();
  else if (button.id==='retry-stream' && activeVideo) startPart(route.part||1);
  else if (button.id === 'people-more') fetchPeople(true);
  else if (button.dataset.route) button.dataset.route==='home'?openHome():navigate(button.dataset.route);
  else if (button.dataset.watch) watch(button.dataset.watch);
  else if (button.dataset.save) toggleSave(button.dataset.save);
  else if (button.hasAttribute('data-category')) navigate(route.name, { category: Number(button.dataset.category) });
  else if (button.hasAttribute('data-refresh')) refreshRoute();
  else if (button.hasAttribute('data-back')) goBack();
  else if (button.id==='toggle-details') setRightPanel(!rightPanelOpen);
  else if (button.id==='toggle-web-mode') setWebFullscreen(!webMode);
  else if (button.id === 'load-more' && !loadingMore && !refreshing) fetchList(true);
  else if (button.id === 'retry-video') watch(route.bvid,{episodeId:route.episodeId,part:route.part,fullscreen:webMode,replace:true});
});
window.bili.onEvent((type, value) => {
  if (Extensions.event(type,value)) return;
  if (type === 'focus-search') setSearchExpanded(true,true);
  else if (type === 'escape') {
    if ($('action-dialog').open) closeAction();
    else if ($('settings-dialog').open) closeSettings();
    else if(route.name!=='home' && !$('search-fields').inert){setSearchExpanded(false);$('search-toggle').focus();}
    else if (NativePlayer.dismissMenu()) return;
    else if (webMode && !$('sidebar').inert) revealImmersiveSidebar(false);
    else if (document.fullscreenElement) document.exitFullscreen().catch(()=>{});
    else if (webMode) setWebFullscreen(false);
    else if (!$('account-panel').hidden) closeAccount();
    else goBack();
  }
  else if (type === 'back') goBack();
  else if (type === 'settings-changed') updatePreferences(value);
  else if (type === 'settings-error') toast(value);
  else if (type === 'boss-hidden') {bossIsHidden=value;NativePlayer.setSuspended(value && appPreferences.bossPause);}
  else if (type === 'window-state') updatePinState(value);
  else if (type === 'pin-feedback') toast(value?'已置顶 · 切到其他应用仍会保留':'已取消置顶');
  else if (type === 'refresh') refreshRoute();
  else if (type === 'persist-progress') {NativePlayer.flushProgress();window.bili.command('progress-saved');}
  else if (type === 'account-changed') updateAccount();
  else if (type === 'dismiss-account') closeAccount();
  else if (type === 'account-error') toast('账号信息暂时无法加载，请重试。');
});
initSettings(); updateSaved(); navigate('home'); updateAccount();
