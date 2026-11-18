'use strict';
let webMode=false, rightPanelOpen=true;
const navigationStack=[];
let homeBatch=0;
const routeKey=r=>JSON.stringify([r.name,r.bvid,r.category||0,r.keyword||'',r.order||'',r.folder||0,r.mid||0,r.episodeId||0,r.seasonId||0,r.type||1,r.status||0,r.finish??-1,r.searchType||'all',!!r.index,Object.entries(r.filters||{}).sort()]);
function rememberRoute(next,replace=false) {
  if(!replace && routeKey(route)!==routeKey(next)){
    navigationStack.push({...route});if(navigationStack.length>60)navigationStack.shift();
  }
}
function updateBackButton() {$('app-back').disabled=!navigationStack.length && !$('settings-dialog').open;}
function goBack() {
  if($('action-dialog').open){closeAction();return;}
  if($('settings-dialog').open){closeSettings();return;}
  if(!$('account-panel').hidden){closeAccount();return;}
  const target=navigationStack.pop();if(!target)return;
  if(target.name==='watch')watch(target.bvid,{replace:true,part:target.part,episodeId:target.episodeId});
  else navigate(target.name,target,{replace:true});
}
function openHome() {
  if(route.name==='home' && !route.category){refreshRoute();return;}
  navigate('home',{page:homeBatch>=100?1:homeBatch+1});
}
function setRightPanel(open) {
  rightPanelOpen=open;
  const layout=document.querySelector('.watch-layout');if(!layout)return;
  layout.classList.toggle('details-collapsed',!open);
  const panel=document.querySelector('.watch-side');panel.inert=!open;panel.setAttribute('aria-hidden',String(!open));
  const button=$('toggle-details');button.setAttribute('aria-expanded',String(open));
  button.setAttribute('aria-label',open?'收起右侧详情':'展开右侧详情');button.title=open?'收起右侧详情':'展开右侧详情';
  button.innerHTML=icon(open?'arrow':'back');
}
function setWebFullscreen(enabled) {
  webMode=enabled && route.name==='watch';
  document.documentElement.classList.toggle('web-fullscreen',webMode);
  const controls=$('immersive-nav'),back=$('app-back'),sidebarToggle=$('sidebar-toggle');
  controls.hidden=!webMode;
  if(webMode&&back.parentElement!==controls)controls.prepend(back);
  if(!webMode&&back.parentElement!==sidebarToggle.parentElement)sidebarToggle.before(back);
  revealImmersiveSidebar(false);
  window.bili.command('web-fullscreen',webMode);
  const detail=$('video-detail'),intro=$('intro-panel'),main=document.querySelector('.watch-main');
  if(detail && intro && main) {
    if(webMode)intro.prepend(detail);else main.append(detail);
    const introTab=document.querySelector('[data-watch-tab=intro]');introTab.hidden=!webMode;
    if(webMode)chooseWatchTab('intro');else if(watchTab==='intro')chooseWatchTab('related');
  }
  const button=$('toggle-web-mode');if(button){button.setAttribute('aria-pressed',String(webMode));button.innerHTML=icon('expand')+(webMode?'退出网页全屏':'网页全屏');}
}
function revealImmersiveSidebar(enabled) {
  const open=webMode&&enabled;
  const button=$('immersive-toggle');
  button.setAttribute('aria-expanded',String(open));
  button.setAttribute('aria-label',open?'隐藏侧栏':'显示侧栏');
  button.title=open?'隐藏侧栏':'显示侧栏';
  $('sidebar').inert=webMode&&!open;
  document.documentElement.classList.toggle('immersive-sidebar-open',open);
}
document.addEventListener('click',event=>{
  if(!webMode)return;
  if(event.target.closest('#immersive-toggle'))revealImmersiveSidebar($('sidebar').inert);
  else if(!event.target.closest('#immersive-nav, #sidebar, #account-panel, dialog'))revealImmersiveSidebar(false);
});
window.addEventListener('toggle-web-fullscreen',()=>setWebFullscreen(!webMode));
