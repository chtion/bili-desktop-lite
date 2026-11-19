'use strict';
const path = require('node:path');
const {WebContentsView,session,ipcMain}=require('electron');

const hongguoOrigin='https://hongguoduanju.com';
const categories=new Set(['real-drama','comic-drama','ai-drama','comic']);
const playerPath=/^\/player\/\d{10,24}(?:\/\d{10,24})?\/?$/;

function webURL(value) {
  try {
    const url=new URL(value);
    if(['https:','http:'].includes(url.protocol)&&!url.username&&!url.password)return url;
  }catch{}
  return null;
}

function addressURL(value) {
  const address=String(value||'').trim().slice(0,2048);
  if(!address)throw new Error('请输入网址或关键词。');
  const explicit=webURL(address);
  if(explicit)return explicit.href;
  const guessed=webURL('https://'+address);
  if(guessed&&/^([^/:?#\s]+\.[^/:?#\s]+|localhost|\[[a-f0-9:]+\])(?=[:/?#]|$)/i.test(address))return guessed.href;
  if(/^[a-z][a-z0-9+.-]*:/i.test(address))throw new Error('请输入 HTTP 或 HTTPS 网址。');
  return 'https://www.bing.com/search?q='+encodeURIComponent(address);
}

function hongguoURL(value) {
  const url=webURL(value);
  return url?.origin===hongguoOrigin?url:null;
}

function createEmbeddedWorkspaces(window,send) {
  const browserSession=session.fromPartition('persist:lite-browser');
  const hongguoSession=session.fromPartition('persist:lite-hongguo');
  for(const partition of [browserSession,hongguoSession]){
    partition.setPermissionRequestHandler((_contents,_name,respond)=>respond(false));
    partition.setPermissionCheckHandler(()=>false);
    partition.on('will-download',event=>event.preventDefault());
  }
  const tabs=new Map(), hongguoViews=new Map();
  let lastId=0, activeId=null, section='home', activeView=null, layout=null;
  let queue=[], queueAt=0, queueIndex=0, queueRequest=null;

  const browserCurrent=()=>tabs.get(activeId);
  const redCurrent=()=>hongguoViews.get(section);
  function browserState() {
    return {activeId,tabs:[...tabs.values()].map(tab=>{
      const contents=tab.view.webContents;
      return {id:tab.id,url:tab.url,title:tab.title||'新标签页',loading:contents.isLoading(),error:tab.error,
        canBack:contents.navigationHistory.canGoBack(),canForward:contents.navigationHistory.canGoForward()};
    })};
  }
  function hongguoState() {
    const item=redCurrent();
    const url=hongguoURL(item?.url);
    return {section,url:item?.url||'',title:item?.title||'',error:item?.error||'',index:queueIndex,total:queue.length,
      canBack:item?.view.webContents.navigationHistory.canGoBack()||false,isPlayer:!!(url&&playerPath.test(url.pathname))};
  }
  function emit(kind) {
    send(kind==='browser'?'browser-state':'hongguo-state',kind==='browser'?browserState():hongguoState());
  }
  function syncView() {
    if(window.isDestroyed())return;
    const item=layout?.mode==='browser'?browserCurrent():layout?.mode==='hongguo'?redCurrent():null;
    const next=layout?.visible&&window.isVisible()&&!window.isMinimized()&&item?.url&&!item.error?item.view:null;
    if(activeView&&activeView!==next){
      activeView.webContents.setAudioMuted(true);
      if(activeView.webContents.session===hongguoSession)activeView.webContents.send('hongguo:pause');
      window.contentView.removeChildView(activeView);
    }
    if(next){
      const [width,height]=window.getContentSize();
      const {x,y,w,h}=layout;
      next.setBounds({x,y,width:Math.max(0,Math.min(w,width-x)),height:Math.max(0,Math.min(h,height-y))});
      if(next!==activeView)window.contentView.addChildView(next);
      next.webContents.setAudioMuted(false);
      if(item.wantsAutoplay&&item.pageReady){
        item.wantsAutoplay=false;
        next.webContents.send('hongguo:autoplay');
      }
    }
    activeView=next;
  }
  function setLayout(value) {
    if(!['browser','hongguo'].includes(value?.mode)){layout=null;syncView();return;}
    const valid=['x','y','w','h'].every(key=>Number.isFinite(value[key]));
    if(!valid)return;
    layout={mode:value.mode,visible:value.visible===true,x:Math.max(0,Math.ceil(value.x)),
      y:Math.max(46,Math.ceil(value.y)),w:Math.max(0,Math.floor(value.w)),h:Math.max(0,Math.floor(value.h))};
    syncView();
  }
  function load(item,url) {
    item.url=url;item.title='';item.error='';
    item.pageReady=false;
    item.wantsAutoplay=item.kind==='hongguo'&&section==='recommended'&&playerPath.test(new URL(url).pathname);
    item.view.webContents.loadURL(url).catch(()=>{});
    syncView();emit(item.kind);
  }
  function create(kind) {
    const red=kind==='hongguo';
    const view=new WebContentsView({webPreferences:{
      session:red?hongguoSession:browserSession,sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true,
      ...(red?{preload:path.join(__dirname,'hongguo-preload.js'),autoplayPolicy:'no-user-gesture-required'}:{})
    }});
    const contents=view.webContents,item={view,kind,url:'',title:'',error:''};
    contents.setAudioMuted(true);
    const allowed=red?hongguoURL:webURL;
    for(const event of ['will-navigate','will-redirect']){
      contents.on(event,(request,url)=>{if(!allowed(request.url||url))request.preventDefault();});
    }
    contents.setWindowOpenHandler(({url})=>{
      if(allowed(url)){
        if(red)load(item,url);
        else newTab(url);
      }
      return {action:'deny'};
    });
    contents.on('did-fail-load',(_event,code,_message,_url,mainFrame)=>{
      if(mainFrame&&code!==-3){item.error='网页暂时无法打开。';syncView();emit(kind);}
    });
    contents.on('render-process-gone',()=>{item.error='网页已停止响应。';syncView();emit(kind);});
    contents.on('did-start-navigation',(event,_url,_inPlace,isMainFrame)=>{
      if(event.isMainFrame??isMainFrame){item.error='';syncView();}
    });
    const changed=(_event,url,mainFrame=true)=>{
      if(!mainFrame||!allowed(url))return;
      item.url=url;item.error='';syncView();emit(kind);
    };
    contents.on('did-navigate',(event,url)=>changed(event,url));
    contents.on('did-navigate-in-page',changed);
    for(const event of ['did-start-loading','did-stop-loading','page-title-updated']){
      contents.on(event,()=>{item.title=contents.getTitle().slice(0,160);emit(kind);});
    }
    if(red)contents.on('did-finish-load',()=>{item.pageReady=true;syncView();});
    contents.on('before-input-event',(event,input)=>{
      if(input.type!=='keyDown')return;
      const key=input.key.toLowerCase();
      if(input.control&&['l','k'].includes(key)){
        event.preventDefault();window.webContents.focus();send(red?'focus-search':'focus-address');
      } else if(key==='f5'){
        event.preventDefault();contents.reload();
      } else if(input.alt&&key==='arrowleft'&&contents.navigationHistory.canGoBack()){
        event.preventDefault();contents.navigationHistory.goBack();
      }
    });
    return item;
  }
  function newTab(url) {
    if(tabs.size>=12)return;
    const item=create('browser');
    item.id=++lastId;tabs.set(item.id,item);activeId=item.id;
    if(url)load(item,url);else syncView();
  }
  function browser(action,id,value) {
    if(!tabs.size)newTab();
    const item=browserCurrent(), contents=item.view.webContents;
    const history=contents.navigationHistory;
    if(action==='new')newTab();
    if(action==='select'&&tabs.has(id))activeId=id;
    if(action==='close'&&tabs.has(id)){
      const removed=tabs.get(id);
      tabs.delete(id);
      if(activeId===id)activeId=[...tabs.keys()].at(-1)||null;
      if(!tabs.size)newTab();
      syncView();removed.view.webContents.close();
    }
    if(action==='go')load(item,addressURL(value));
    if(action==='back'&&history.canGoBack())history.goBack();
    if(action==='forward'&&history.canGoForward())history.goForward();
    if(action==='refresh'&&item.url){if(item.error)load(item,item.url);else contents.reload();}
    syncView();emit('browser');
    return browserState();
  }
  async function fetchQueue() {
    if(queue.length&&Date.now()-queueAt<10*60*1000)return;
    if(!queueRequest)queueRequest=(async()=>{
      const response=await hongguoSession.fetch(hongguoOrigin+'/',{signal:AbortSignal.timeout(12000)});
      if(!response.ok)throw new Error('红果官网暂时无法获取推荐。');
      const ids=[...(await response.text()).matchAll(/href="\/detail\?series_id=(\d{10,24})"/g)].map(match=>match[1]);
      const next=[...new Set(ids)].slice(0,120);
      if(!next.length)throw new Error('红果官网暂时没有可用的推荐。');
      const currentId=queue[queueIndex];
      queue=next;queueIndex=Math.max(0,queue.indexOf(currentId));queueAt=Date.now();
    })().finally(()=>{queueRequest=null;});
    return queueRequest;
  }
  async function recommend(delta) {
    await fetchQueue();
    if(section!=='recommended'||layout?.mode!=='hongguo')return;
    const index=Math.min(queue.length-1,Math.max(0,queueIndex+delta));
    const item=redCurrent();
    if(index===queueIndex&&delta&&item.url&&!item.error)return;
    queueIndex=index;
    load(item,hongguoOrigin+'/player/'+queue[index]);
  }
  async function hongguo(action,value) {
    if(action==='section'){
      if(!['home','category','recommended','mine'].includes(value))return hongguoState();
      section=value;
      emit('hongguo');
      if(section!=='mine'&&!redCurrent())hongguoViews.set(section,create('hongguo'));
      const item=redCurrent();
      syncView();
      if(item&&!item.url){
        if(section==='recommended')await recommend(0);
        else load(item,hongguoOrigin+(section==='home'?'/':'/category/real-drama'));
      }
    }
    const item=redCurrent();
    if(action==='step'&&section==='recommended')await recommend(value===-1?-1:1);
    if(action==='category'&&section==='category'&&categories.has(value))load(item,hongguoOrigin+'/category/'+value);
    if(action==='open'){
      const url=hongguoURL(value);
      if(url&&playerPath.test(url.pathname)){
        section='saved';
        if(!redCurrent())hongguoViews.set(section,create('hongguo'));
        load(redCurrent(),url.href);
      }
    }
    if(action==='back'&&item?.view.webContents.navigationHistory.canGoBack())item.view.webContents.navigationHistory.goBack();
    if(action==='refresh'){
      if(item?.url)load(item,item.url);
      else if(section==='recommended')await recommend(0);
    }
    emit('hongguo');
    return hongguoState();
  }
  function onWheel(event,delta) {
    if(section!=='recommended'||layout?.mode!=='hongguo'||event.sender!==activeView?.webContents)return;
    const url=hongguoURL(event.senderFrame?.url);
    if(event.senderFrame!==event.sender.mainFrame||!url||!playerPath.test(url.pathname)||![1,-1].includes(delta))return;
    hongguo('step',delta).catch(error=>send('extension-error',error.message));
  }
  ipcMain.on('hongguo:wheel',onWheel);
  for(const event of ['show','hide','minimize','restore','resize'])window.on(event,syncView);
  window.once('closed',()=>{
    ipcMain.removeListener('hongguo:wheel',onWheel);
    const pages=[...tabs.values(),...hongguoViews.values()];
    tabs.clear();hongguoViews.clear();
    for(const {view} of pages){
      if(!view.webContents.isDestroyed())view.webContents.close();
    }
  });
  return {browser,hongguo,setLayout};
}
module.exports={createEmbeddedWorkspaces};
