'use strict';
const { app, BrowserWindow, ipcMain, protocol, net, session, dialog, shell, nativeTheme, globalShortcut, Tray, Menu, nativeImage, clipboard } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { isBiliURL, videoId, imageURL, normalizeVideo, plainText } = require('./navigation');
const { createMediaService } = require('./media');
const { createPersonalAPI } = require('./personal');
const { createPreferences } = require('./preferences');
const {createWbi}=require('./wbi');
const {createSubtitles}=require('./subtitles');
const {createShows,positive}=require('./shows');
const {createSocial}=require('./social');
const {createRecommendations}=require('./recommendations');
const {collectionFromView}=require('./collections');
const {createHistorySync}=require('./history-sync');
const {createUpdates,repository}=require('./updates');
const {readGitHubCredential}=require('./github-credentials');
const {version}=require('../package.json');
const {createSearch}=require('./search');
const {createEmbeddedWorkspaces}=require('./embedded-workspaces');
const {liveDirectory,followedLive}=require('./live');
const {createHongguo,officialURL}=require('./hongguo');
const {createDramaImports,imported}=require('./drama-imports');
const SHELL_URL = 'bili-app://shell/';
let mainWindow, biliSession, siteWindow;
let embeddedWorkspaces, hongguo, dramaImports;
const media = createMediaService(() => biliSession);
const historySync=createHistorySync(()=>biliSession);
const personal = createPersonalAPI(apiJSON, accountInfo);
const wbi=createWbi(apiJSON),subtitles=createSubtitles(wbi,()=>biliSession),shows=createShows(apiJSON,accountInfo);
const social=createSocial(apiJSON,accountInfo,()=>biliSession),recommendations=createRecommendations(apiJSON,wbi,accountInfo);
const search=createSearch(apiJSON,wbi);
let primed;
let accountPromise;
let overlayOpen = false;
let preferences, updates, shortcutCapture=false, watching=false, webFullscreen=false, themeMode='system', closeReceiver;
let bossHidden=false, recoveryTray, siteWasVisible=false, audioWasMuted=false, siteAudioWasMuted=false;
function windowState() {
  const state={pinned:!!mainWindow?.isAlwaysOnTop(),watching,fullscreen:!!mainWindow?.isFullScreen()};
  send('window-state',state);
  return state;
}
function applyPin(enabled) {
  const level=process.platform==='win32'&&mainWindow.isFullScreen()?'pop-up-menu':'floating';
  mainWindow.setAlwaysOnTop(enabled,level);
}
function togglePin() {
  if(!mainWindow || mainWindow.isDestroyed() || !watching)return null;
  const enabled=!mainWindow.isAlwaysOnTop();
  applyPin(enabled);
  const state=windowState();
  if(state.pinned===enabled)send('pin-feedback',state.pinned);
  return state;
}
function restoreFromBoss() {
  if(!mainWindow || mainWindow.isDestroyed())return;
  bossHidden=false;
  mainWindow.webContents.setAudioMuted(audioWasMuted);
  if(mainWindow.isMinimized())mainWindow.restore();
  mainWindow.show();mainWindow.focus();
  if(siteWindow && !siteWindow.isDestroyed()){
    siteWindow.webContents.setAudioMuted(siteAudioWasMuted);if(siteWasVisible)siteWindow.show();
  }
  siteWasVisible=false;
  recoveryTray?.destroy();recoveryTray=null;
  send('boss-hidden',false);
}
function toggleBoss() {
  if(!mainWindow || mainWindow.isDestroyed())return;
  if(bossHidden){restoreFromBoss();return;}
  try {
    recoveryTray=new Tray(nativeImage.createFromPath(path.join(__dirname,'../assets/icon.png')).resize({width:16,height:16}));
    recoveryTray.setToolTip('Bili Lite · 双击恢复窗口');
    recoveryTray.setContextMenu(Menu.buildFromTemplate([{label:'恢复窗口',click:restoreFromBoss},{type:'separator'},{label:'退出 Bili Lite',click:()=>app.quit()}]));
    recoveryTray.on('double-click',restoreFromBoss);
  }catch{send('settings-error','托盘图标创建失败，请重试。');return;}
  bossHidden=true;audioWasMuted=mainWindow.webContents.isAudioMuted();
  mainWindow.webContents.setAudioMuted(true);
  send('boss-hidden',true);
  siteWasVisible=!!siteWindow?.isVisible();
  if(siteWindow && !siteWindow.isDestroyed()){siteAudioWasMuted=siteWindow.webContents.isAudioMuted();siteWindow.webContents.setAudioMuted(true);if(siteWasVisible)siteWindow.hide();}
  mainWindow.hide();
}
function captureShortcuts(active) {
  if(shortcutCapture===active)return;
  shortcutCapture=active;
  if(active)preferences?.suspend();else preferences?.resume();
}
async function accountInfo() {
  if (accountPromise) return accountPromise;
  accountPromise = (async () => {
    const nav = await apiJSON('/x/web-interface/nav', true);
    if (!nav.isLogin) return { loggedIn: false };
    const stats = await apiJSON('/x/web-interface/nav/stat').catch(() => null);
    return {
      loggedIn: true, mid: Number(nav.mid), name: String(nav.uname || ''), avatar: imageURL(nav.face),
      vip: !!nav.vipStatus, level: Number(nav.level_info?.current_level) || 0,
      coins: Number.isFinite(nav.money) ? nav.money : null,
      following: Number.isFinite(stats?.following) ? stats.following : null,
      followers: Number.isFinite(stats?.follower) ? stats.follower : null,
      dynamics: Number.isFinite(stats?.dynamic_count) ? stats.dynamic_count : null
    };
  })().finally(() => { accountPromise = null; });
  return accountPromise;
}
protocol.registerSchemesAsPrivileged([{ scheme: 'bili-app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } }]);
app.setName('Bili Desktop Lite');
app.setAppUserModelId('com.bilidesktop.lite');
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if(bossHidden){restoreFromBoss();return;}
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show(); mainWindow.focus();
  });
  app.whenReady().then(initialize).catch((error) => { dialog.showErrorBox('启动失败', error.message); app.quit(); });
}
function send(type, value) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('app:event', type, value);
}
function trusted(event) {
  return mainWindow && event.sender === mainWindow.webContents && event.senderFrame === mainWindow.webContents.mainFrame && event.senderFrame.url === SHELL_URL;
}
async function primeSession() {
  if (!primed) primed = biliSession.fetch('https://www.bilibili.com/', { credentials: 'include', signal: AbortSignal.timeout(15000) }).then((response) => response.body?.cancel()).catch(() => { primed = null; });
  await primed;
}
async function apiJSON(endpoint, allowLoggedOut = false) {
  await primeSession();
  const response = await biliSession.fetch(`https://api.bilibili.com${endpoint}`, { credentials: 'include', cache: 'no-store', headers: { Referer: 'https://www.bilibili.com/' }, signal: AbortSignal.timeout(18000) });
  if (!response.ok) throw new Error(`内容暂时无法加载（${response.status}），请稍后重试。`);
  const json = await response.json();
  if (allowLoggedOut && json.code === -101) return { ...(json.data || {}), isLogin: false };
  if (json.code !== 0) throw new Error(json.code === -101 ? '请先登录 B 站。' : `B站暂时未返回内容（${json.code}），请稍后重试。`);
  return json.data ?? json.result;
}
function playable(result, metadata) {
  const source=media.prepare(result);
  historySync.start(source,metadata);
  return {...source,...metadata,syncEnabled:true};
}
function category(value) {
  return [0, 1, 3, 4, 36, 188, 160, 211].includes(Number(value)) ? Number(value) : 0;
}
async function requestData(method, data = {}) {
  const page = Math.min(100, Math.max(1, Number(data.page) | 0));
  switch (method) {
    case 'pin-window': {
      const state=togglePin();
      if(!state)throw new Error('请在播放页使用置顶。');
      return state;
    }
    case 'update-info': return updates.info();
    case 'check-update': return updates.check(data.local===true,data.automatic===true);
    case 'update-release-page': return shell.openExternal(`https://github.com/${repository}/releases/latest`);
    case 'install-update': return updates.install();
    case 'cancel-update': return updates.cancel();
    case 'settings': return preferences.get();
    case 'save-settings': {
      const result=preferences.save(data);send('settings-changed',result);return result;
    }
    case 'browser-command': return embeddedWorkspaces.browser(data.action,data.id,data.value);
    case 'live-directory': return liveDirectory(biliSession);
    case 'live-following': return followedLive(biliSession);
    case 'live-room': return embeddedWorkspaces.openLive(data.id);
    case 'browser-download': return embeddedWorkspaces.download(data.action,data.id);
    case 'hongguo': return imported(data.sourceId)?dramaImports.browse(data.method,data):hongguo.request(data.method,data);
    case 'hongguo-official': return shell.openExternal(officialURL(data.seriesId,data.episodeId,data.episodeNumber));
    case 'drama-sources': return dramaImports.command(data.action,data.value);
    case 'drama-import-files': {
      const selected=await dialog.showOpenDialog(mainWindow,{title:'导入短剧站源',properties:['openFile','multiSelections'],
        filters:[{name:'短剧列表',extensions:['json','m3u','m3u8']}]});
      return selected.canceled?{canceled:true}:dramaImports.files(selected.filePaths);
    }
    case 'feed': {
      const rid = category(data.category);
      if(!rid)return recommendations(page);
      const result = await apiJSON(`/x/web-interface/ranking/v2?rid=${rid}&type=all`);
      return { items: (result.list || []).map(normalizeVideo).filter((v) => v.bvid), more: false };
    }
    case 'ranking': {
      const result = await apiJSON(`/x/web-interface/ranking/v2?rid=${category(data.category)}&type=all`);
      return { items: (result.list || []).slice(0, 100).map(normalizeVideo).filter((v) => v.bvid), more: false };
    }
    case 'search': return search(data,page);
    case 'video': {
      if(positive(data.episodeId))return shows.episode(data);
      const id = videoId(data.bvid);
      if (!id) throw new Error('这个视频链接无法识别，请粘贴包含 BV 号的链接。');
      const result = await apiJSON(`/x/web-interface/view?bvid=${id}`);
      return { ...normalizeVideo(result), coinLimit:Number(result.copyright)===1?2:1, original:Number(result.copyright)===1, comments:Number(result.stat?.reply)||0, collection:collectionFromView(result), description: String(result.desc || '').slice(0, 12000), pages: (result.pages || []).map((p) => ({ page: p.page, cid: Number(p.cid), title: String(p.part || '').slice(0, 160),duration:Number(p.duration)||0 })) };
    }
    case 'video-extra': {
      const id=videoId(data.bvid);if(!id)throw new Error('无效的视频编号。');
      const detail=await apiJSON(`/x/web-interface/view/detail?bvid=${id}`);
      if(detail.View?.bvid!==id)throw new Error('视频详情暂不可用。');
      return {tags:(detail.Tags||[]).slice(0,24).map(tag=>plainText(tag.tag_name)).filter(Boolean),fans:Math.max(0,Number(detail.Card?.card?.fans)||0),uploads:Math.max(0,Number(detail.Card?.archive_count)||0)};
    }
    case 'related': {
      const id = videoId(data.bvid);
      if (!id) throw new Error('无效的视频编号。');
      const result = await apiJSON(`/x/web-interface/archive/related?bvid=${id}`);
      return { items: (result || []).slice(0, 18).map(normalizeVideo).filter((v) => v.bvid) };
    }
    case 'playback': {
      if(positive(data.episodeId)){
        const v=await shows.episode(data),result=await shows.play(data);
        return playable(result,{cid:v.pages[0].cid,aid:v.aid,bvid:v.bvid,episodeId:v.episodeId,seasonId:v.seasonId,showType:v.showType});
      }
      const id = videoId(data.bvid);
      if (!id) throw new Error('无效的视频编号。');
      const view = await apiJSON('/x/web-interface/view?bvid=' + id);
      const part = (view.pages || []).find(p => p.page === Number(data.part || 1));
      if (!part) throw new Error('找不到这个分集。');
      const result = await apiJSON('/x/player/playurl?bvid=' + id + '&cid=' + part.cid + '&qn=127&fnval=4048&fourk=1');
      return playable(result,{cid:part.cid,aid:view.aid,bvid:id});
    }
    case 'subtitle-tracks': return subtitles.list(data);
    case 'subtitle-content': return subtitles.content(data.token);
    case 'bangumi': return shows.list(data,page);
    case 'anime': return shows.discover(data,page);
    case 'anime-filters': return shows.filters(data);
    case 'season': return shows.season(data);
    case 'video-state': case 'video-folders': case 'like-video': case 'coin-video': case 'favorite-video': case 'follow-author': case 'show-follow': return social(method,data);
    case 'collection': {
      const id=videoId(data.bvid);if(!id)throw new Error('无效的视频编号。');
      const v=await apiJSON('/x/web-interface/view?bvid='+id),c=collectionFromView(v);if(!c)return {items:[],more:false};
      const r=await apiJSON(`/x/polymer/web-space/seasons_archives_list?mid=${c.mid}&season_id=${c.id}&sort_reverse=false&page_num=${page}&page_size=30`);
      return {items:(r.archives||[]).map(normalizeVideo).filter(x=>x.bvid),more:page*30<Number(r.page?.total),total:Number(r.page?.total)||c.count};
    }
    case 'share-video': {
      const id=videoId(data.bvid),ep=positive(data.episodeId);if(!id&&!ep)throw new Error('无效的视频编号。');
      clipboard.writeText(ep?'https://www.bilibili.com/bangumi/play/ep'+ep:'https://www.bilibili.com/video/'+id+'/');return {};
    }
    case 'progress': return preferences.get().values.historySync?historySync.update(data):{status:'disabled'};
    case 'release-media': {
      const token=String(data.token);
      historySync.release(token);media.release(token);dramaImports.release(token);
      await hongguo.release(token);
      return {};
    }
    case 'danmaku': {
      const cid = Number(data.cid); if (!Number.isSafeInteger(cid) || cid <= 0) throw new Error('无效的分集编号。');
      const response = await biliSession.fetch('https://api.bilibili.com/x/v1/dm/list.so?oid=' + cid, {headers:{Referer:'https://www.bilibili.com/'}, signal:AbortSignal.timeout(15000)});
      if (!response.ok) throw new Error('弹幕暂时无法加载。');
      return { xml: (await response.text()).slice(0,4000000) };
    }
    case 'comments': {
      const aid = Number(data.aid); if (!Number.isSafeInteger(aid) || aid <= 0) throw new Error('无效的视频编号。');
      const root=String(data.root||'');
      const sort=data.sort==='new'?0:2;
      const endpoint=/^\d{1,20}$/.test(root)?`/x/v2/reply/reply?root=${root}&type=1&oid=${aid}&pn=${page}&ps=20`:`/x/v2/reply?type=1&oid=${aid}&pn=${page}&ps=20&sort=${sort}`;
      const r=await apiJSON(endpoint);
      const pinned=!root&&page===1?r.top?.upper:null;
      const replies=(r.replies||[]).filter(c=>!pinned||c.rpid!==pinned.rpid);
      return {items:[...(pinned?[pinned]:[]),...replies].map(c=>({id:String(c.rpid_str||c.rpid),name:String(c.member?.uname||''),mid:Number(c.member?.mid),avatar:imageURL(c.member?.avatar),text:String(c.content?.message||'').slice(0,8000),likes:Number(c.like)||0,replies:Number(c.rcount)||0,time:Number(c.ctime)||0,pinned:c===pinned})),more:!!r.replies?.length&&page*20<Number(r.page?.count),total:Number(r.page?.acount||r.page?.count)||0};
    }
    case 'favorite-folders': case 'favorites': case 'profile': case 'uploads': case 'dynamics': return personal(method,data,page);
    case 'account': return accountInfo();
    case 'following':
    case 'followers': {
      const account = await accountInfo();
      if (!account.loggedIn) throw new Error('请先登录 B站，再查看你的关注和粉丝。');
      const endpoint = method === 'following' ? 'followings' : 'followers';
      const result = await apiJSON(`/x/relation/${endpoint}?vmid=${account.mid}&pn=${page}&ps=30&order=desc`);
      return { items: (result.list || []).map((user) => ({ mid: Number(user.mid), name: String(user.uname || '').slice(0, 80), avatar: imageURL(user.face), sign: String(user.sign || '').slice(0, 300), official: String(user.official_verify?.desc || '').slice(0, 120) })).filter((user) => Number.isSafeInteger(user.mid) && user.mid > 0), total: Number(result.total) || 0, more: page * 30 < Number(result.total) && !!result.list?.length };
    }
    default: throw new Error('不支持这个操作。');
  }
}
function applyTheme(mode) {
  themeMode=mode;
  nativeTheme.themeSource = ['light', 'dark'].includes(mode) ? mode : 'system';
  const dark = webFullscreen || nativeTheme.shouldUseDarkColors;
  mainWindow?.setTitleBarOverlay({ color: webFullscreen ? '#0a0b0e' : dark ? '#171923' : '#ffffff', symbolColor: dark ? '#e9eaf2' : '#333342', height: 46 });
}
function bindKeys(contents) {
  contents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown' || shortcutCapture) return;
    if (input.control && ['k', 'l'].includes(input.key.toLowerCase())) {
      event.preventDefault(); mainWindow.webContents.focus(); send('focus-search');
    } else if (input.key === 'F11') {
      event.preventDefault(); mainWindow.setFullScreen(!mainWindow.isFullScreen());
    } else if (input.key === 'Escape' && overlayOpen) {
      event.preventDefault(); send('dismiss-account');
    } else if (input.key === 'Escape') {
      event.preventDefault();
      if (mainWindow.isFullScreen()) mainWindow.setFullScreen(false); else send('escape');
    } else if (input.alt && input.key === 'ArrowLeft') {
      event.preventDefault(); send('back');
    } else if (input.key === 'F5') { event.preventDefault(); send('refresh'); }
  });
}
async function external(value) {
  let url;
  try { url = new URL(value); } catch { return; }
  if (url.protocol !== 'https:' || url.username || url.password) return;
  const choice = await dialog.showMessageBox(mainWindow, { type: 'question', message: '在默认浏览器中打开这个链接？', detail: url.hostname, buttons: ['取消', '打开浏览器'], defaultId: 0, cancelId: 0 });
  if (choice.response === 1) await shell.openExternal(url.href);
}
function openSite(url) {
  if (!isBiliURL(url)) return;
  if (siteWindow && !siteWindow.isDestroyed()) { siteWindow.show(); siteWindow.focus(); siteWindow.loadURL(url).catch(() => {}); return; }
  siteWindow = new BrowserWindow({ width: 1160, height: 820, minWidth: 800, minHeight: 600, parent: mainWindow, title: '哔哩哔哩', autoHideMenuBar: true, icon: path.join(__dirname, '../assets/icon.png'), webPreferences: { session: biliSession, nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true } });
  siteWindow.removeMenu();
  siteWindow.webContents.setWindowOpenHandler(({ url: target }) => {
    if (isBiliURL(target)) setImmediate(() => siteWindow?.loadURL(target).catch(() => {})); else external(target).catch(() => {});
    return { action: 'deny' };
  });
  for (const name of ['will-navigate', 'will-redirect']) siteWindow.webContents.on(name, (event, target) => { if (!isBiliURL(target)) event.preventDefault(); });
  siteWindow.on('closed', () => { siteWindow = null; send('account-changed'); });
  siteWindow.loadURL(url).catch(() => {});
}
async function initialize() {
  preferences=createPreferences(app.getPath('userData'),globalShortcut,{boss:toggleBoss,pin:togglePin});
  updates=createUpdates({app,version,fetch:(...args)=>fetch(...args),portableFile:process.env.PORTABLE_EXECUTABLE_FILE,onProgress:state=>send('update-progress',state),
    getCredential:()=>readGitHubCredential(repository,app.getPath('userData')),
    chooseFolder:async()=>{const result=await dialog.showOpenDialog(mainWindow,{title:'选择包含 bili-release.json 的发布文件夹',properties:['openDirectory']});return result.filePaths[0];}});
  biliSession = session.fromPartition('persist:bilibili');
  biliSession.setUserAgent(biliSession.getUserAgent().replace(/\sElectron\/\S+/g, '').replace(/\sbili-desktop-lite\/\S+/gi, ''), 'zh-CN');
  biliSession.setPermissionRequestHandler((_wc, permission, callback) => callback(permission === 'fullscreen'));
  biliSession.setPermissionCheckHandler((_wc, permission) => permission === 'fullscreen');
  let cookieTimer;
  biliSession.cookies.on('changed', (_event, cookie) => {
    if (cookie.name !== 'SESSDATA' || !cookie.domain.endsWith('bilibili.com')) return;
    clearTimeout(cookieTimer);
    cookieTimer = setTimeout(() => send('account-changed'), 500);
  });
  const files = new Map([['/', 'index.html'], ['/style.css', 'style.css'], ['/renderer.js', 'renderer.js'], ['/icons.js', 'icons.js'], ['/playback.js','playback.js'], ['/panels.js','panels.js'], ['/video-ui.js','video-ui.js'], ['/shows-ui.js','shows-ui.js'], ['/settings-ui.js','settings-ui.js'], ['/watch-layout.js','watch-layout.js'], ['/vendor/artplayer.js','vendor/artplayer.js'], ['/vendor/shaka.js','vendor/shaka.js'], ['/vendor/danmuku.js','vendor/danmuku.js']]);
  files.set('/progress-ui.js','progress-ui.js');
  files.set('/search-ui.js','search-ui.js');
  files.set('/stream-feed.js','stream-feed.js');
  files.set('/extensions-ui.js','extensions-ui.js');
  files.set('/live-ui.js','live-ui.js');
  files.set('/hongguo-ui.js','hongguo-ui.js');
  files.set('/hongguo-collection.js','hongguo-collection.js');
  files.set('/shortcut-keys.js','shortcut-keys.js');
  hongguo=createHongguo({directory:app.getPath('userData'),network:session.fromPartition('lite-hongguo-media')});
  dramaImports=createDramaImports(app.getPath('userData'));
  protocol.handle('bili-app', async (request) => {
    const url = new URL(request.url);
    if (url.hostname === 'shell' && url.pathname.startsWith('/media/')) return media.handle(request);
    if (url.hostname === 'shell' && url.pathname.startsWith('/drama-media/')) return hongguo.handleMedia(request);
    if (url.hostname === 'shell' && url.pathname.startsWith('/import-media/')) return dramaImports.handleMedia(request);
    if (url.hostname === 'hongguo-image') return hongguo.handleImage(request);
    if (url.hostname === 'drama-image') return dramaImports.handleImage(request);
    if (url.hostname === 'shell' && files.has(url.pathname)) return net.fetch(pathToFileURL(path.join(__dirname, files.get(url.pathname))).href);
    if (url.hostname === 'image') {
      const source = imageURL(url.searchParams.get('url'));
      if (!source) return new Response('', { status: 400 });
      try {
        const response = await biliSession.fetch(source, { headers: { Referer: 'https://www.bilibili.com/' }, signal: AbortSignal.timeout(12000) });
        if (!response.ok || !response.headers.get('content-type')?.startsWith('image/') || Number(response.headers.get('content-length')) > 12000000) return new Response('', { status: 404 });
        return new Response(response.body, { headers: { 'Content-Type': response.headers.get('content-type'), 'Cache-Control': 'public, max-age=86400' } });
      } catch { return new Response('', { status: 502 }); }
    }
    return new Response('Not found', { status: 404 });
  });
  mainWindow = new BrowserWindow({ width: 1440, height: 960, minWidth: 720, minHeight: 500, title: 'Bili Lite', backgroundColor: '#f7f8fc', titleBarStyle: 'hidden', titleBarOverlay: { color: '#ffffff', symbolColor: '#333342', height: 46 }, icon: path.join(__dirname, '../assets/icon.png'), show: false, webPreferences: { preload: path.join(__dirname, 'preload.js'), nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true } });
  mainWindow.removeMenu();
  embeddedWorkspaces=createEmbeddedWorkspaces(mainWindow,send,biliSession,bindKeys);
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event) => event.preventDefault());
  bindKeys(mainWindow.webContents);
  ipcMain.handle('app:request', async (event, method, data) => {
    if (!trusted(event)) return { ok: false, error: '无效的来源。' };
    try { return { ok: true, data: await requestData(method, data && typeof data === 'object' ? data : {}) }; }
    catch (error) { return { ok: false, error: error.name === 'TimeoutError' ? '连接超时，请稍后重试。' : /^net::/.test(error.message) ? '网络连接失败，请检查网络后重试。' : error.message }; }
  });
  ipcMain.on('app:command', (event, action, value) => {
    if (!trusted(event)) return;
    switch (action) {
      case 'theme': applyTheme(value); break;
      case 'login': openSite('https://passport.bilibili.com/login'); break;
      case 'overlay': overlayOpen = value === true; break;
      case 'extension-layout': embeddedWorkspaces.setLayout(value);break;
      case 'shortcut-capture': captureShortcuts(value===true); break;
      case 'boss': toggleBoss(); break;
      case 'pin': togglePin(); break;
      case 'progress-saved': closeReceiver?.(); break;
      case 'play-state':
        watching=value===true;
        if(!watching)mainWindow.setAlwaysOnTop(false);
        windowState();break;
      case 'web-fullscreen': webFullscreen=value===true && watching;applyTheme(themeMode);break;
    }
  });
  mainWindow.on('resize', () => send('resize'));
  mainWindow.on('focus', () => send('account-changed'));
  mainWindow.on('blur',()=>captureShortcuts(false));
  mainWindow.on('always-on-top-changed',windowState);
  mainWindow.on('show',()=>{if(bossHidden)restoreFromBoss();});
  function fullscreenChanged() {
    if(mainWindow.isAlwaysOnTop())applyPin(true);
    windowState();send('resize');
  }
  mainWindow.on('enter-full-screen',fullscreenChanged);
  mainWindow.on('leave-full-screen',fullscreenChanged);
  let closeAllowed=false;
  mainWindow.on('close', event => {
    if(!watching||closeAllowed||mainWindow.webContents.isCrashed()){siteWindow?.close();return;}
    event.preventDefault();
    if(closeReceiver)return;
    const finish=()=>{
      closeReceiver=null;closeAllowed=true;
      if(mainWindow&&!mainWindow.isDestroyed())mainWindow.close();
    };
    const timeout=setTimeout(finish,750);
    closeReceiver=()=>{clearTimeout(timeout);setTimeout(finish,100);};
    send('persist-progress');
  });
  mainWindow.on('closed', () => { mainWindow = null; });
  await mainWindow.loadURL(SHELL_URL);
  mainWindow.show();
}
app.on('window-all-closed', () => app.quit());
app.on('will-quit',event=>{
  const cleanup=hongguo?.dispose();
  if(cleanup){event.preventDefault();void cleanup.then(()=>app.quit());return;}
  preferences?.dispose();recoveryTray?.destroy();
});
