'use strict';
const {app,BrowserWindow,globalShortcut}=require('electron');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{setTimeout:delay}=require('node:timers/promises');
const {execFileSync}=require('node:child_process');
const packaged=process.argv.includes('--packaged');
const profile=path.resolve(packaged?'.cache/v23-packaged-test':'.cache/v23-fold-test');fs.mkdirSync(profile,{recursive:true});
fs.writeFileSync(path.join(profile,'preferences.json'),JSON.stringify({webFullscreen:false,rightPanel:true,bossPause:true,bossKey:'Control+Alt+Shift+F8',pinKey:'Control+Alt+Shift+F9'}));
app.setPath('userData',profile);
require(packaged?'../dist/win-unpacked/resources/app.asar/src/main.js':'../src/main');
async function until(p,label,ms=45000){const start=Date.now();while(!await p()){if(Date.now()-start>ms)throw new Error('Timeout: '+label);await delay(150);}}
let win;
function nativeWindowIsAbove(front,back) {
  const hwnd=w=>{const value=w.getNativeWindowHandle();return value.length===8?value.readBigUInt64LE().toString():value.readUInt32LE().toString();};
  const script=`Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class BiliWindowOrder {
  [DllImport("user32.dll")]
  public static extern IntPtr GetWindow(IntPtr hWnd, uint command);
}
'@
$front=[IntPtr]${hwnd(front)}
$cursor=[IntPtr]${hwnd(back)}
for($i=0;$i -lt 256;$i++){
  $cursor=[BiliWindowOrder]::GetWindow($cursor,3)
  if($cursor -eq $front){'above';exit 0}
  if($cursor -eq [IntPtr]::Zero){break}
}
'below'`;
  return execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{encoding:'utf8',windowsHide:true,timeout:12000}).trim()==='above';
}
async function run(){
  await app.whenReady();await until(()=>BrowserWindow.getAllWindows().some(w=>w.webContents.getURL()==='bili-app://shell/'),'shell');
  win=BrowserWindow.getAllWindows()[0];const wc=win.webContents;
  wc.setBackgroundThrottling(false);const errors=[];
  wc.on('console-message',e=>{if(e.level==='error'){errors.push(e.message);console.error(e.message);}});
  const js=source=>wc.executeJavaScript(source).catch(e=>{console.error(source);throw e;});
  await until(()=>js('!!document.querySelector(".video-card")'),'home');
  const first=await js('document.querySelector(".video-title").textContent');
  await js('document.querySelector(".brand").click()');await until(()=>js('document.querySelector(".video-title")?.textContent!=='+JSON.stringify(first)+' && !!document.querySelector(".video-card")'),'logo changes recommendation');
  const refreshed=await js('document.querySelector(".video-title").textContent');const refreshedPage=await js('route.page');
  await js('document.getElementById("settings-button").click()');await until(()=>js('document.getElementById("settings-dialog").open'),'settings');
  await js('document.getElementById("pref-web-fullscreen").click()');
  async function record(id,key){
    await js(`document.getElementById('${id}').focus()`);await delay(100);
    wc.sendInputEvent({type:'keyDown',keyCode:key,modifiers:['control','alt','shift']});await delay(100);
    wc.sendInputEvent({type:'keyUp',keyCode:key,modifiers:['control','alt','shift']});await delay(100);
  }
  await record('pref-boss-key','F6');await record('pref-pin-key','F6');
  await js('document.getElementById("save-settings").click()');await until(()=>js('document.getElementById("settings-error").textContent.includes("不能相同")'),'duplicate shortcut error');
  assert.equal(JSON.parse(fs.readFileSync(path.join(profile,'preferences.json'))).webFullscreen,false);
  await record('pref-pin-key','F7');
  fs.mkdirSync('test-results',{recursive:true});fs.writeFileSync('test-results/v23-settings.png',(await win.capturePage()).toPNG());
  await js('document.getElementById("save-settings").click()');await until(()=>js('!document.getElementById("settings-dialog").open'),'save preferences');
  assert.equal(globalShortcut.isRegistered('Control+Alt+Shift+F6'),true);assert.equal(globalShortcut.isRegistered('Control+Alt+Shift+F7'),true);
  assert.equal(globalShortcut.isRegistered('Control+Alt+Shift+F8'),false);
  const disk=JSON.parse(fs.readFileSync(path.join(profile,'preferences.json')));assert.equal(disk.webFullscreen,true);
  await js('document.getElementById("search").value="BV1R54y1n7wh";document.getElementById("search-form").requestSubmit()');
  await until(()=>js('!!document.querySelector("video")'),'player');await js('document.querySelector("video").muted=true');
  await until(()=>js('document.querySelector("video").currentTime>1'),'playing');
  assert.equal(await js('webMode'),true);assert.equal(await js('document.getElementById("video-detail").parentElement.id'),'intro-panel');
  await js('window.testVideo=document.querySelector("video")');
  const pin=await js('(()=>{const b=document.getElementById("pin-window"),r=b.getBoundingClientRect();const x=r.x+r.width/2,y=r.y+r.height/2;return {x,y,hit:document.elementFromPoint(x,y)?.closest("button")===b};})()');
  assert.equal(pin.hit,true,'caption pin hit test');
  for(const type of ['mouseDown','mouseUp'])wc.sendInputEvent({type,x:Math.floor(pin.x),y:Math.floor(pin.y),button:'left',clickCount:1});
  await until(()=>win.isAlwaysOnTop(),'pin native window using pointer');
  const other=new BrowserWindow({width:480,height:330,show:false,title:'Bili Lite test cover'});
  other.show();other.focus();await until(()=>other.isFocused(),'another window receives focus');
  assert.equal(win.isAlwaysOnTop(),true,'the playback window remains topmost after another window gains focus');
  if(process.platform==='win32')assert.equal(nativeWindowIsAbove(win,other),true,'Windows z-order keeps the pinned Bili window above the focused test window');
  other.destroy();win.focus();
  assert.equal(await js('document.getElementById("pin-window").getAttribute("aria-pressed")'),'true');
  const pinRect=await js('(()=>{const p=document.getElementById("pin-window").getBoundingClientRect(),b=navigator.windowControlsOverlay.getTitlebarAreaRect();return {right:p.right,width:p.width,top:p.top,captionEnd:b.x+b.width,backTop:document.getElementById("app-back").getBoundingClientRect().top};})()');
  assert.equal(pinRect.top,0);assert.ok(pinRect.backTop>=0&&pinRect.backTop<46);
  assert.ok(await js('document.getElementById("sidebar").inert && document.getElementById("app-back").parentElement.id==="immersive-nav"'));
  const layouts=[];
  for(const size of [[1040,720],[1440,960]]){
    win.setContentSize(...size);await delay(350);
    for(const open of [true,false]){
      await js(`if(rightPanelOpen!==${open})document.getElementById('toggle-details').click()`);await delay(350);
      const r=await js('(()=>{const w=document.getElementById("workspace"),v=document.getElementById("player-slot").getBoundingClientRect(),p=document.querySelector(".watch-side").getBoundingClientRect();return {width:innerWidth,open:rightPanelOpen,videoWidth:v.width,videoHeight:v.height,panelWidth:p.width,panelRight:p.right,overflow:w.scrollWidth>w.clientWidth,sameVideo:window.testVideo===document.querySelector("video")};})()');
      assert.equal(r.overflow,false);assert.equal(r.sameVideo,true);if(open)assert.ok(r.panelWidth>=330);else assert.equal(r.panelWidth,0);layouts.push(r);
      assert.equal(await js('(()=>{const b=document.getElementById("toggle-details"),r=b.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest("button")===b;})()'),true,'Details toggle is visible and clickable above the player');
      await js('NativePlayer.current.art.controls.show=true');fs.writeFileSync(`test-results/v23-fold-${size[0]}-${open?'open':'closed'}.png`,(await win.capturePage()).toPNG());
    }
  }
  await js('document.getElementById("toggle-details").click();document.querySelector("[data-watch-tab=comments]").click()');await until(()=>js('!!document.querySelector(".comment-card") || !!document.getElementById("comments-retry")'),'comments');
  await js('document.querySelector("[data-watch-tab=intro]").click();window.bili.command("boss")');
  await until(()=>!win.isVisible(),'boss hidden');assert.equal(wc.isAudioMuted(),true);await until(()=>js('document.querySelector("video").paused'),'boss pause');
  const paused=await js('document.querySelector("video").currentTime');await delay(350);assert.equal(await js('document.querySelector("video").currentTime'),paused);
  await js('window.bili.command("boss")');await until(()=>win.isVisible(),'boss restored');assert.equal(wc.isAudioMuted(),false);assert.equal(await js('document.querySelector("video").paused'),true);
  await js('document.querySelector(".art-control-app-fullscreen").click()');assert.equal(await js('webMode'),false);assert.equal(await js('document.getElementById("video-detail").parentElement.className'),'watch-main');
  assert.ok(await js('document.getElementById("immersive-nav").hidden && document.querySelector(".sidebar-controls > #app-back")!==null'));
  await js('setWebFullscreen(true);document.getElementById("immersive-toggle").click()');
  assert.equal(await js('document.getElementById("sidebar").inert'),false);
  await js('document.getElementById("immersive-toggle").click()');
  assert.equal(await js('document.getElementById("sidebar").inert'),true);
  const back=await js('(()=>{const b=document.getElementById("app-back"),r=b.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;return {x,y,hit:!b.disabled&&document.elementFromPoint(x,y)?.closest("button")===b};})()');
  assert.equal(back.hit,true,'immersive back is clickable with the sidebar hidden');
  for(const type of ['mouseDown','mouseUp'])wc.sendInputEvent({type,x:Math.floor(back.x),y:Math.floor(back.y),button:'left',clickCount:1});
  await until(()=>js('!!document.querySelector(".video-card")'),'immersive back returns to the previous route');assert.equal(win.isAlwaysOnTop(),false);assert.equal(await js('route.page'),refreshedPage);
  await js('document.querySelector(".brand").click()');await until(()=>js('!!document.querySelector(".video-card") && document.querySelector(".video-title").textContent!=='+JSON.stringify(refreshed)),'home refresh after back');
  await js('document.getElementById("settings-button").click()');await until(()=>js('document.getElementById("settings-dialog").open'),'settings again');
  await js('document.getElementById("pref-web-fullscreen").click();document.getElementById("pref-right-panel").click();document.getElementById("save-settings").click()');await until(()=>js('!document.getElementById("settings-dialog").open'),'save normal defaults');
  await js('document.getElementById("search").value="BV1R54y1n7wh";document.getElementById("search-form").requestSubmit()');await until(()=>js('!!document.querySelector("video")'),'normal default');
  assert.equal(await js('webMode'),false);assert.equal(await js('rightPanelOpen'),false);
  await js('document.querySelector(".art-control-app-fullscreen").click()');assert.equal(await js('webMode'),true);
  wc.sendInputEvent({type:'keyDown',keyCode:'Escape'});await delay(150);assert.equal(await js('webMode'),false);assert.ok(await js('!!document.querySelector("video")'));
  assert.deepEqual(win.getMinimumSize(),[720,500]);
  win.setContentSize(720,500);await delay(450);
  const narrow=await js('(()=>{const w=document.getElementById("workspace"),p=document.getElementById("player-slot"),a=document.getElementById("account");return {width:innerWidth,height:innerHeight,overflow:w.scrollWidth>w.clientWidth,player:p.getBoundingClientRect().width,accountBottom:a.getBoundingClientRect().bottom};})()');
  assert.equal(narrow.width,720);assert.equal(narrow.height,500);assert.equal(narrow.overflow,false);assert.ok(narrow.player>=550);assert.ok(narrow.accountBottom<=narrow.height);
  await js('setWebFullscreen(true);setRightPanel(false)');await delay(350);
  assert.equal(await js('Math.round(document.getElementById("player-slot").getBoundingClientRect().width)'),720);
  await js('setRightPanel(true)');await delay(350);
  assert.equal(await js('Math.round(document.getElementById("player-slot").getBoundingClientRect().width)'),720,'narrow detail drawer does not squeeze playback');
  fs.writeFileSync('test-results/v26-compact-player.png',(await win.capturePage()).toPNG());
  assert.deepEqual(errors,[]);
  const report={passed:true,packaged,version:require('../package.json').version,logoRefresh:true,defaultModes:true,shortcutRecording:true,duplicateRejected:true,shortcutsRegistered:true,preferencesPersisted:true,pinNativeWindow:true,bossHideMutePauseRestore:true,sidebarBack:true,backWithHiddenSidebar:true,escapeExitsWebMode:true,pinRect,layouts,narrow,captionPinHitTest:true,topmostAfterFocusChange:true};
  fs.writeFileSync('test-results/fold-settings'+(packaged?'-packaged':'')+'.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));app.exit(0);
}
run().catch(async e=>{console.error(e);if(win){fs.mkdirSync('test-results',{recursive:true});fs.writeFileSync('test-results/v23-failure.png',(await win.capturePage()).toPNG());}app.exit(1);});
