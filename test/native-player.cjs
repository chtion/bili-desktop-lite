'use strict';
const {app,BrowserWindow,webContents,session}=require('electron');
const path=require('node:path'),fs=require('node:fs'),assert=require('node:assert/strict');
const {setTimeout:delay}=require('node:timers/promises');
const packaged=process.argv.includes('--packaged');
app.setPath('userData',path.resolve(packaged?'.cache/v22-packaged-test':'.cache/v22-player-test'));
require(packaged?'../dist/win-unpacked/resources/app.asar/src/main.js':'../src/main');
async function until(p,label,ms=45000){const start=Date.now();while(!await p()){if(Date.now()-start>ms)throw new Error('Timeout: '+label);await delay(200);}}
async function run(){
  await app.whenReady();await until(()=>BrowserWindow.getAllWindows().some(w=>w.webContents.getURL()==='bili-app://shell/'),'shell');
  const win=BrowserWindow.getAllWindows()[0],wc=win.webContents,js=s=>wc.executeJavaScript(s);wc.setBackgroundThrottling(false);
  const errors=[];wc.on('console-message',e=>{if(e.level==='error'){errors.push(e.message);console.error(e.message.slice(0,500));}});
  await until(()=>js('!!document.querySelector(".video-card")'),'home');
  const before=await js('document.querySelector(".video-title").textContent');
  await js('document.querySelector("[data-refresh]").click()');
  await until(()=>js('document.querySelector(".video-title")?.textContent!=='+JSON.stringify(before)+' && !document.querySelector("[data-refresh]").disabled'),'refresh changed');
  await js('document.getElementById("search").value="Unity";document.getElementById("search-form").requestSubmit()');
  await until(()=>js('document.querySelector("h1")?.textContent.includes("Unity") && !!document.querySelector(".video-card")'),'search');
  await js('if(document.documentElement.classList.contains("sidebar-collapsed")) document.getElementById("sidebar-toggle").click()');await delay(350);
  await js('document.getElementById("search").value="BV1R54y1n7wh";document.getElementById("search-form").requestSubmit()');
  await until(()=>js('!!document.querySelector("video")'),'native video');
  await js('document.querySelector("video").muted=true');
  await until(()=>js('document.querySelector("video")?.currentTime>1'),'playback',60000);
  assert.equal(await js('document.documentElement.classList.contains("sidebar-collapsed")'),true);
  assert.equal(webContents.getAllWebContents().filter(w=>w.getURL().includes('player.bilibili.com')).length,0);
  const playback=await js('(()=>{const v=document.querySelector("video"),p=NativePlayer.current.engine;return {time:v.currentTime,ready:v.readyState,width:v.videoWidth,height:v.videoHeight,audioDecoded:v.webkitAudioDecodedByteCount,stats:p.getStats(),tracks:p.getVariantTracks().map(t=>({height:t.height,audioCodec:t.audioCodec,videoCodec:t.videoCodec}))};})()');
  assert.ok(playback.width>0);assert.ok(playback.tracks.every(t=>t.audioCodec));
  await js('document.querySelector("video").pause()');const paused=await js('document.querySelector("video").currentTime');await delay(700);assert.equal(await js('document.querySelector("video").currentTime'),paused);
  await js('document.querySelector("video").currentTime=60;document.querySelector("video").play()');
  await until(()=>js('document.querySelector("video").currentTime>61 && !document.querySelector("video").seeking'),'seek playback');
  await js('document.querySelector("video").playbackRate=1.5');assert.equal(await js('document.querySelector("video").playbackRate'),1.5);
  await js('(()=>{const art=NativePlayer.current.art,q=art.setting.find("stream-quality");art.setting.show=true;q.$item.click();q.selector.at(-1).$item.click();})()');
  await until(()=>js('document.querySelector("video").videoHeight===360'),'quality switch');
  await js('NativePlayer.current.art.setting.show=false');
  wc.sendInputEvent({type:'keyDown',keyCode:'F11'});await delay(350);assert.equal(win.isFullScreen(),true);
  wc.sendInputEvent({type:'keyDown',keyCode:'Escape'});await delay(350);assert.equal(win.isFullScreen(),false);assert.ok(await js('!!document.querySelector("video")'));
  await js('document.querySelector("[data-watch-tab=parts]").click()');assert.ok(await js('document.querySelectorAll("[data-part]").length>0'));
  await js('document.querySelector("[data-watch-tab=comments]").click()');await until(()=>js('!!document.querySelector(".comment-card") || !!document.getElementById("comments-retry") || document.getElementById("comments-panel").textContent.includes("暂时没有")'),'comments result');
  const commentResult=await js('({count:document.querySelectorAll(".comment-card").length,error:document.querySelector("#comments-panel .pane-caption")?.textContent})');
  await js('document.querySelector("[data-watch-tab=related]").click()');
  const layouts=[];
  fs.mkdirSync('test-results',{recursive:true});
  for(const size of [[1040,720],[1440,960]]){
    win.setContentSize(...size);await delay(400);
    const layout=await js('(()=>{let p=document.getElementById("player-slot").getBoundingClientRect(),r=document.querySelector(".watch-side").getBoundingClientRect();return {width:innerWidth,playerWidth:p.width,playerHeight:p.height,sideWidth:r.width,sideRight:r.right,overflow:document.getElementById("workspace").scrollWidth>document.getElementById("workspace").clientWidth};})()');
    assert.equal(layout.overflow,false);assert.ok(layout.sideRight<=size[0]);layouts.push(layout);
    for(const theme of ['light','dark']){await js(`document.querySelector('[data-theme-mode=${theme}]').click();NativePlayer.current.art.controls.show=true`);await delay(300);fs.writeFileSync(`test-results/v22-player-${size[0]}-${theme}.png`,(await win.capturePage()).toPNG());}
  }
  await js('document.getElementById("account").click()');assert.equal(await js('document.getElementById("account-panel").hidden'),false);await js('document.querySelector("[data-close-account]").click()');
  await js('document.querySelector("[data-route=home]").click()');await until(()=>js('!!document.querySelector(".video-card")'),'back home');assert.equal(await js('!!document.querySelector("video")'),false);assert.equal(await js('NativePlayer.current===null'),true);
  const retained=await js('document.querySelector(".video-title").textContent');
  const s=session.fromPartition('persist:bilibili');s.webRequest.onBeforeRequest({urls:['https://api.bilibili.com/x/web-interface/popular*','https://api.bilibili.com/x/web-interface/wbi/index/top/feed/rcmd*']},(_d,cb)=>cb({cancel:true}));
  await js('document.querySelector("[data-refresh]").click()');await until(()=>js('!refreshing'),'failed refresh settles');assert.equal(await js('document.querySelector(".video-title").textContent'),retained);s.webRequest.onBeforeRequest(null);
  const report={passed:true,version:require('../package.json').version,refreshChanged:true,refreshFailurePreservesList:true,search:true,builtInPlayer:true,autoCollapse:true,pause:true,seek:true,rate:true,qualitySwitch:true,fullscreenEscape:true,playback,commentResult,layouts,errors};fs.writeFileSync('test-results/native-player.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
  if(!process.argv.includes('--inspect-ui'))app.exit(0);else console.log('INSPECT_UI_READY');
}
run().catch(e=>{console.error(e);app.exit(1);});
