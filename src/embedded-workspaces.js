'use strict';
const {WebContentsView,session}=require('electron');

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

function createEmbeddedWorkspaces(window,send) {
  const browserSession=session.fromPartition('persist:lite-browser');
  browserSession.setPermissionRequestHandler((_contents,_name,respond)=>respond(false));
  browserSession.setPermissionCheckHandler(()=>false);
  browserSession.on('will-download',event=>event.preventDefault());
  const tabs=new Map();
  let lastId=0, activeId=null, activeView=null, layout=null;

  const browserCurrent=()=>tabs.get(activeId);
  function browserState() {
    return {activeId,tabs:[...tabs.values()].map(tab=>{
      const contents=tab.view.webContents;
      return {id:tab.id,url:tab.url,title:tab.title||'新标签页',loading:contents.isLoading(),error:tab.error,
        canBack:contents.navigationHistory.canGoBack(),canForward:contents.navigationHistory.canGoForward()};
    })};
  }
  const emit=()=>send('browser-state',browserState());
  function syncView() {
    if(window.isDestroyed())return;
    const item=browserCurrent();
    const next=layout?.visible&&window.isVisible()&&!window.isMinimized()&&item?.url&&!item.error?item.view:null;
    if(activeView&&activeView!==next){
      activeView.webContents.setAudioMuted(true);
      window.contentView.removeChildView(activeView);
    }
    if(next){
      const [width,height]=window.getContentSize();
      const {x,y,w,h}=layout;
      next.setBounds({x,y,width:Math.max(0,Math.min(w,width-x)),height:Math.max(0,Math.min(h,height-y))});
      if(next!==activeView)window.contentView.addChildView(next);
      next.webContents.setAudioMuted(false);
    }
    activeView=next;
  }
  function setLayout(value) {
    if(value?.mode!=='browser'){layout=null;syncView();return;}
    const valid=['x','y','w','h'].every(key=>Number.isFinite(value[key]));
    if(!valid)return;
    layout={visible:value.visible===true,x:Math.max(0,Math.ceil(value.x)),
      y:Math.max(46,Math.ceil(value.y)),w:Math.max(0,Math.floor(value.w)),h:Math.max(0,Math.floor(value.h))};
    syncView();
  }
  function load(item,url) {
    item.url=url;item.title='';item.error='';
    item.view.webContents.loadURL(url).catch(()=>{});
    syncView();emit();
  }
  function create() {
    const view=new WebContentsView({webPreferences:{
      session:browserSession,sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true
    }});
    const contents=view.webContents,item={view,url:'',title:'',error:''};
    contents.setAudioMuted(true);
    for(const event of ['will-navigate','will-redirect']){
      contents.on(event,(request,url)=>{if(!webURL(request.url||url))request.preventDefault();});
    }
    contents.setWindowOpenHandler(({url})=>{
      if(webURL(url))newTab(url);
      return {action:'deny'};
    });
    contents.on('did-fail-load',(_event,code,_message,_url,mainFrame)=>{
      if(mainFrame&&code!==-3){item.error='网页暂时无法打开。';syncView();emit();}
    });
    contents.on('render-process-gone',()=>{item.error='网页已停止响应。';syncView();emit();});
    contents.on('did-start-navigation',(event,_url,_inPlace,isMainFrame)=>{
      if(event.isMainFrame??isMainFrame){item.error='';syncView();}
    });
    const changed=(_event,url,mainFrame=true)=>{
      if(!mainFrame||!webURL(url))return;
      item.url=url;item.error='';syncView();emit();
    };
    contents.on('did-navigate',(event,url)=>changed(event,url));
    contents.on('did-navigate-in-page',changed);
    for(const event of ['did-start-loading','did-stop-loading','page-title-updated']){
      contents.on(event,()=>{item.title=contents.getTitle().slice(0,160);emit();});
    }
    contents.on('before-input-event',(event,input)=>{
      if(input.type!=='keyDown')return;
      const key=input.key.toLowerCase();
      if(input.control&&['l','k'].includes(key)){
        event.preventDefault();window.webContents.focus();send('focus-address');
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
    const item=create();
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
    syncView();emit();
    return browserState();
  }
  for(const event of ['show','hide','minimize','restore','resize'])window.on(event,syncView);
  window.once('closed',()=>{
    const pages=[...tabs.values()];
    tabs.clear();
    for(const {view} of pages){
      if(!view.webContents.isDestroyed())view.webContents.close();
    }
  });
  return {browser,setLayout};
}
module.exports={createEmbeddedWorkspaces};
