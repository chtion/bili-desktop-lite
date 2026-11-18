'use strict';
const { app, BrowserWindow, session } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { setTimeout: delay } = require('node:timers/promises');
app.setPath('userData', path.resolve('.cache/v22-test-profile'));
require('../src/main');
async function until(predicate, label, timeout = 35000) {
  const start = Date.now();
  while (!await predicate()) { if (Date.now() - start > timeout) throw new Error(`Timeout: ${label}`); await delay(150); }
}
async function run() {
  await app.whenReady();
  await until(() => BrowserWindow.getAllWindows().some((w) => w.webContents.getURL() === 'bili-app://shell/'), 'shell');
  const win = BrowserWindow.getAllWindows()[0], wc = win.webContents;
  const js = (source) => wc.executeJavaScript(source).catch(e=>{console.error('FAILED SCRIPT',source);throw e;});
  wc.on('console-message',e=>{if(e.level==='error')console.error(e.message);});
  wc.setBackgroundThrottling(false); win.show(); win.focus();
  await until(() => js('!!document.querySelector(".video-card")'), 'live homepage');
  await until(() => js('[...document.querySelectorAll(".video-card img")].filter(i=>i.complete&&i.naturalWidth>0).length>=4'), 'live covers');
  assert.equal(await js('document.querySelector(".browse-toolbar h1").textContent'), '发现');
  const layouts = [];
  for (const size of [[1040,720],[1440,960]]) {
    win.setContentSize(...size); await delay(350);
    for (const collapsed of [false,true]) {
      await js(`if(document.documentElement.classList.contains('sidebar-collapsed')!==${collapsed})document.getElementById('sidebar-toggle').click()`);
      await delay(350);
      const layout = await js(`(()=>{const s=document.getElementById('sidebar').getBoundingClientRect(),a=document.getElementById('account').getBoundingClientRect(),w=document.getElementById('workspace'),bar=document.querySelector('.browse-toolbar'),last=document.querySelector('.refresh-feed').getBoundingClientRect();return {collapsed:${collapsed},width:innerWidth,sidebar:s.width,account:{left:a.left,right:a.right,bottom:a.bottom},workspace:w.getBoundingClientRect().left,overflow:w.scrollWidth>w.clientWidth,toolbarFits:last.right<=innerWidth-20};})()`);
      assert.equal(layout.overflow,false); assert.equal(layout.toolbarFits,true);
      assert.equal(layout.workspace,layout.sidebar); assert.ok(layout.account.right<=layout.sidebar);
      assert.ok(layout.account.bottom>size[1]-40);
      if(collapsed)assert.equal(layout.sidebar,68);
      layouts.push(layout);
    }
  }
  await wc.reload();
  await until(()=>js('!!document.querySelector(".video-card")'), 'reload');
  assert.equal(await js('document.documentElement.classList.contains("sidebar-collapsed")'),true);
  const animated=await js('new Promise(resolve=>{document.getElementById("sidebar-toggle").click();setTimeout(()=>resolve(document.getElementById("sidebar").getBoundingClientRect().width),70);})');
  assert.ok(animated>68 && animated<220,'Sidebar width animates through intermediate values');
  await delay(300);await js('document.getElementById("sidebar-toggle").click()');await delay(300);
  await js('document.getElementById("workspace").scrollTop=800');
  await until(()=>js('!document.getElementById("back-top").hidden'),'back-to-top visible');
  await js('document.getElementById("back-top").click()');
  await until(()=>js('document.getElementById("workspace").scrollTop===0 && document.getElementById("back-top").hidden'),'scroll reset');
  await js('document.getElementById("account").click()');
  await until(()=>js('!!document.querySelector(".guest-profile")'),'guest panel');
  await js('document.querySelector("[data-close-account]").click()');

  // Controlled API fixtures exercise authenticated UI without using a real account.
  const s = session.fromPartition('persist:bilibili');
  let failStats=false, failFollowing=false, loggedIn=true;
  const sample=await js('currentItems.slice(0,3)');
  let favoriteRequests=0;
  const requested=[];
  s.protocol.handle('https', (request) => {
    const url=new URL(request.url);
    if(url.hostname!=='api.bilibili.com') return s.fetch(request,{bypassCustomProtocolHandlers:true});
    let data;
    if(url.pathname==='/x/web-interface/nav') data=loggedIn ? {isLogin:true,mid:12345,uname:'界面测试账号',face:'',vipStatus:1,level_info:{current_level:6},money:12.5,wbi_img:{img_url:'https://i0.hdslb.com/bfs/wbi/abcdefghijklmnopqrstuvwxyz012345.png',sub_url:'https://i0.hdslb.com/bfs/wbi/6789abcdefghijklmnopqrstuvwxyz01.png'}} : {isLogin:false};
    else if(url.pathname==='/x/web-interface/nav/stat') {
      if(failStats)return Response.json({code:-500,message:'fixture failure'});
      data={following:31,follower:18,dynamic_count:7};
    } else if(url.pathname==='/x/relation/followings'||url.pathname==='/x/relation/followers') {
      requested.push(url.searchParams.get('vmid'));
      if(failFollowing)return Response.json({code:-500,message:'fixture failure'});
      const pn=Number(url.searchParams.get('pn'));
      data={total:31,list:Array.from({length:pn===1?30:1},(_,i)=>({mid:20000+(pn-1)*30+i,uname:`测试 UP ${String((pn-1)*30+i+1).padStart(2,'0')}`,face:'',sign:'用于验证关注列表的测试资料'}))};
    } else if(url.pathname==='/x/v3/fav/folder/created/list-all') data={list:[{id:101,title:'每天都想看',media_count:3},{id:202,title:'学习与灵感',media_count:1}]};
    else if(url.pathname==='/x/v3/fav/resource/list') {
      favoriteRequests++;const second=url.searchParams.get('media_id')==='202', pn=Number(url.searchParams.get('pn'));
      const chosen=second?[sample[2]]:pn===1?sample.slice(0,2):sample.slice(2);
      data={info:{media_count:second?1:3},has_more:!second&&pn===1,medias:chosen.map(v=>({...v,cover:v.cover,upper:{name:v.author},cnt_info:{play:v.views,danmaku:v.danmaku}}))};
    } else if(url.pathname==='/x/web-interface/card') data={card:{name:'测试 UP 01',face:'',sign:'这里是应用内个人空间',fans:1234,attention:56,level_info:{current_level:6}},archive_count:3};
    else if(url.pathname==='/x/series/recArchivesByKeywords') data={archives:sample.map(v=>({...v,pic:v.cover,play:v.views})),page:{total:3}};
    else if(url.pathname==='/x/polymer/web-dynamic/v1/feed/space') data={items:[{id_str:'1001',modules:{module_author:{name:'界面测试账号',face:'',pub_time:'今天'},module_dynamic:{desc:{text:'测试动态，留在 App 内阅读。'},major:{archive:{bvid:sample[0].bvid,title:sample[0].title,cover:sample[0].cover}}}}}],has_more:false};
    else return s.fetch(request,{bypassCustomProtocolHandlers:true});
    return Response.json({code:0,data});
  });
  await js('document.getElementById("account").click()');
  await until(()=>js('document.querySelector(".profile-summary strong")?.textContent==="界面测试账号"'),'signed-in profile');
  assert.equal(await js('document.querySelector("[data-people=following] strong").textContent'),'31');
  assert.equal(await js('document.querySelector("[data-people=followers] strong").textContent'),'18');
  fs.mkdirSync('test-results',{recursive:true});
  await delay(300);
  fs.writeFileSync('test-results/v22-account-fixture.png',(await win.capturePage()).toPNG());
  await js('document.querySelector("[data-account-page=favorites]").click()');
  await until(()=>js('document.querySelectorAll(".folder-tabs button").length===2 && document.querySelectorAll(".video-card").length===2'),'favorite folders');
  await js('document.getElementById("load-more").click()');
  await until(()=>js('document.querySelectorAll(".video-card").length===3'),'favorites pagination');
  await js('document.querySelector(\'[data-folder="202"]\').click()');
  await until(()=>js('document.querySelectorAll(".video-card").length===1'),'switch favorite folder');
  const oldFavoriteRequests=favoriteRequests;await js('document.querySelector("[data-refresh]").click()');
  await until(()=>favoriteRequests>oldFavoriteRequests,'refresh favorites');
  await until(()=>js('!refreshing && !!document.querySelector(".video-card")'),'favorites ready');
  assert.equal(BrowserWindow.getAllWindows().length,1);
  fs.writeFileSync('test-results/v22-favorites-fixture.png',(await win.capturePage()).toPNG());
  await js('document.getElementById("account").click()');
  await js('document.querySelector("[data-account-page=profile]").click()');
  await until(()=>js('!!document.querySelector(".space-profile") && document.querySelectorAll(".video-card").length===3'),'own native profile');
  await js('document.getElementById("account").click()');
  await js('document.querySelector("[data-account-page=dynamics]").click()');
  await until(()=>js('document.querySelector(".dynamic-card")?.textContent.includes("测试动态")'),'native dynamics');
  assert.equal(BrowserWindow.getAllWindows().length,1);
  await js('document.getElementById("account").click()');
  await js('document.querySelector("[data-people=following]").click()');
  await until(()=>js('document.querySelectorAll(".person-card").length===30'),'following list');
  await js('document.getElementById("people-more").click()');
  await until(()=>js('document.querySelectorAll(".person-card").length===31'),'following pagination');
  assert.ok(requested.every(mid=>mid==='12345'));
  await js('document.querySelector(".person-name").click()');
  await until(()=>js('document.querySelector(".space-profile")?.textContent.includes("测试 UP 01") && !!document.querySelector(".video-card")'),'followed UP native profile');
  assert.equal(BrowserWindow.getAllWindows().length,1);
  await js('document.getElementById("account").click()');
  await js('document.querySelector("[data-people=following]").click()');
  await until(()=>js('!!document.querySelector(".person-card")'),'back following');
  await js('document.querySelector(".people-tabs [data-people=followers]").click()');
  await until(()=>js('document.querySelectorAll(".person-card").length===30'),'followers list');
  failFollowing=true;
  await js('document.querySelector("[data-refresh]").click()');
  await until(()=>js('!!document.querySelector("#people-area .empty-state")'),'following error state');
  failStats=true;
  await js('document.getElementById("account").click()');
  await until(()=>js('!!document.querySelector(".stats-unavailable")'),'missing stats');
  assert.equal(await js('document.querySelector("[data-people=following] strong").textContent'),'—');
  loggedIn=false;
  await js('document.querySelector("[data-refresh-account]").click()');
  await until(()=>js('document.getElementById("account-name").textContent==="登录 B站"'),'sign-out state');
  s.protocol.unhandle('https');
  await js('document.querySelector(".nav-item[data-route=home]").click()');
  await until(()=>js('!!document.querySelector(".video-card")'),'real homepage restored');
  await until(()=>js('[...document.querySelectorAll(".video-card img")].filter(i=>i.complete&&i.naturalWidth>0).length>=4'),'preview covers');
  fs.mkdirSync('test-results',{recursive:true});
  for (const mode of ['light','dark']) {
    await js(`document.querySelector('[data-theme-mode="${mode}"]').click()`);
    for(const collapsed of [false,true]) {
      await js(`if(document.documentElement.classList.contains('sidebar-collapsed')!==${collapsed})document.getElementById('sidebar-toggle').click()`);
      await delay(400);
      fs.writeFileSync(`test-results/v22-${mode}-${collapsed?'collapsed':'expanded'}.png`,(await win.capturePage()).toPNG());
    }
  }
  const report={passed:true,version:require('../package.json').version,layouts,sidebarPersistence:true,backToTop:true,liveHomepage:true,accountFixture:{nativeFavorites:true,favoritePagination:true,favoriteRefresh:true,nativeProfile:true,nativeDynamics:true,noWebPopup:true,profile:true,following:true,followers:true,pagination:true,missingStats:true,errorState:true,signOut:true}};
  fs.writeFileSync('test-results/sidebar-account-v22.json',JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
  app.exit(0);
}
run().catch(e=>{console.error(e);app.exit(1)});
