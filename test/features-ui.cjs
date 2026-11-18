'use strict';
const {app,BrowserWindow,session,dialog}=require('electron'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{setTimeout:delay}=require('node:timers/promises');
const packaged=process.argv.includes('--packaged');
app.setPath('userData',path.resolve('.cache/v25-features-'+process.pid+(packaged?'-packaged':'')));
const {createHash}=require('node:crypto');
const updateFixture=path.join(app.getPath('userData'),'update-fixture');
fs.mkdirSync(updateFixture,{recursive:true});
const updateBytes=Buffer.from('isolated update fixture'),updateName='Bili-Desktop-Lite-0.11.0-Setup-x64.exe';
fs.writeFileSync(path.join(updateFixture,updateName),updateBytes);
fs.writeFileSync(path.join(updateFixture,'bili-release.json'),JSON.stringify({version:'0.11.0',assets:{installer:{name:updateName,size:updateBytes.length,sha256:createHash('sha256').update(updateBytes).digest('hex')}}}));
dialog.showOpenDialog=async()=>({canceled:false,filePaths:[updateFixture]});
const bv='BV1R54y1n7wh',aid=846713533,cid=370435164;
let loggedIn=true,state={like:false,coin:0,favorite:false,attention:false},selected=false,failLike=false,postCalls=[],feedCalls=[],showCalls=[],heartbeat=[],animeCalls=[],indexQueries=[],searchQueries=[];
const fixture={aid,bvid:bv,cid,title:'界面测试 · 一起发现喜欢的内容',pic:'https://i0.hdslb.com/bfs/archive/18f237427319864f1074b0fb48c31a7b47bafb35.jpg',owner:{mid:1001,name:'测试 UP 主',face:''},copyright:1,pubdate:1700000000,desc:'用于验证账号互动、合集与分 P 的隔离数据。',stat:{view:234567,like:1234,coin:256,favorite:678,share:80},pages:[{page:1,cid,part:'上篇 · 起点',duration:250},{page:2,cid,part:'下篇 · 新的发现',duration:250}],ugc_season:{id:91,mid:1001,title:'灵感放映室',ep_count:3,sections:[{title:'第一季',episodes:[{bvid:bv,title:'第一集',arc:{aid,pic:'',duration:250}}]}]}};
const season={season_id:24588,title:'测试番剧 · 星海漫游',cover:fixture.pic,evaluate:'一次穿过星海的旅行。测试剧集页面与原生播放流程。',styles:['科幻','日常'],rating:{score:9.7},new_ep:{desc:'全 2 话'},user_status:{follow:1},episodes:[1,2].map((n)=>({id:232464+n,aid,bvid:bv,cid,title:String(n),long_title:'向星海出发 '+n,duration:250000,cover:fixture.pic,badge:n===2?'会员':''}))};
let interceptReady=app.whenReady().then(async()=>{
  const s=session.fromPartition('persist:bilibili');await s.cookies.set({url:'https://www.bilibili.com/',name:'bili_jct',value:'isolated-test-csrf'});
  for(const [name,value] of [['SESSDATA','isolated-test-session'],['DedeUserID','42']])await s.cookies.set({url:'https://www.bilibili.com/',name,value});
  s.protocol.handle('https',async req=>{
    const u=new URL(req.url),p=u.pathname;let d;
    if(req.method==='POST'){
      assert.equal(u.hostname,'api.bilibili.com');const body=new URLSearchParams(await req.text());assert.equal(body.get('csrf'),'isolated-test-csrf');if(p==='/x/click-interface/web/heartbeat'){heartbeat.push({bvid:body.get('bvid'),cid:Number(body.get('cid')),time:Number(body.get('played_time')),type:Number(body.get('type')),epid:Number(body.get('epid'))});return Response.json({code:0});}postCalls.push({path:p,values:Object.fromEntries([...body].filter(([k])=>k!=='csrf'))});
      if(p==='/x/web-interface/archive/like'){if(failLike)return Response.json({code:-500,message:'测试：点赞暂时失败'});state.like=body.get('like')==='1';}
      else if(p==='/x/web-interface/coin/add'){state.coin+=Number(body.get('multiply'));if(body.get('select_like')==='1')state.like=true;}
      else if(p==='/x/v3/fav/resource/deal'){selected=body.get('add_media_ids')==='10';state.favorite=selected;}
      else if(p==='/x/relation/modify')state.attention=body.get('act')==='1';
      else if(p==='/pgc/web/follow/add')season.user_status.follow=1;
      else if(p==='/pgc/web/follow/del')season.user_status.follow=0;
      else throw Error('Unexpected mutation: '+p);
      return Response.json({code:0,data:{}});
    }
    if(u.hostname==='aisubtitle.hdslb.com')return Response.json({body:[{from:0,to:50,content:'AI 字幕测试 · 星海漫游 <b>保持纯文本</b>'}]});
    if(u.hostname!=='api.bilibili.com')return s.fetch(req,{bypassCustomProtocolHandlers:true});
    if(p==='/x/web-interface/nav')d={isLogin:loggedIn,mid:loggedIn?42:undefined,uname:'测试账号',level_info:{current_level:6},money:25,wbi_img:{img_url:'https://i0.hdslb.com/bfs/wbi/7cd084941338484aae1ad9425b84077c.png',sub_url:'https://i0.hdslb.com/bfs/wbi/4932caff0ff746eab6f01bf08b70ac45.png'}};
    else if(p==='/x/web-interface/nav/stat')d={following:42,follower:6,dynamic_count:1};
    else if(p==='/x/web-interface/wbi/index/top/feed/rcmd'){feedCalls.push(u.searchParams.get('fresh_idx'));d={mid:loggedIn?42:0,item:[{...fixture,title:'推荐第 '+feedCalls.length+' 批',goto:'av'}]};}
    else if(p==='/x/web-interface/view')d=fixture;
    else if(p==='/x/web-interface/view/detail')d={View:fixture,Card:{card:{fans:26000},archive_count:19},Tags:[{tag_name:'长视频'}]};
    else if(p==='/pgc/season/index/condition')d={filter:[{field:'year',name:'年份',values:[{keyword:'-1',name:'全部'},{keyword:'[2025,2026)',name:'2025'}]}]};
    else if(p==='/x/web-interface/wbi/search/all/v2'){searchQueries.push('all');d={result:[{result_type:'video',data:[fixture]},{result_type:'bili_user',data:[{mid:1001,uname:'测试账号名称',fans:123}]},{result_type:'media_bangumi',data:[season]}]};}
    else if(p==='/x/web-interface/search/type'){const type=u.searchParams.get('search_type');searchQueries.push(type);d={result:type==='video'?[fixture]:type==='bili_user'?[{mid:1001,uname:'测试账号名称',fans:123}]:[season],numResults:1,numPages:1};}
    else if(p==='/pgc/season/index/result'){indexQueries.push(u.searchParams.get('year'));animeCalls.push(u.searchParams.get('season_type'));d={list:[{...season,index_show:'全 2 话'}],total:1,has_next:0};}
    else if(p==='/x/web-interface/archive/relation')d=state;
    else if(p==='/x/v3/fav/folder/created/list-all')d={list:[{id:10,title:'值得反复观看',fav_state:selected?1:0,media_count:12},{id:20,title:'知识收藏夹',fav_state:0,media_count:30}]};
    else if(p==='/x/web-interface/archive/related')d=[fixture];
    else if(p==='/x/player/wbi/v2')d={aid,cid,online_count:35,view_points:[{from:30,content:'第二章'}],subtitle:{subtitles:[{id:1,lan:'ai-zh',lan_doc:'中文（自动生成）',ai_type:1,subtitle_url:'https://aisubtitle.hdslb.com/test.json'}]}};
    else if(p==='/x/polymer/web-space/seasons_archives_list')d={archives:[fixture,{...fixture,bvid:'BV1as411p7ae',title:'第二集'},{...fixture,bvid:'BV1xx411c7mD',title:'第三集'}],page:{total:3}};
    else if(p==='/x/space/bangumi/follow/list'){showCalls.push({type:u.searchParams.get('type'),status:u.searchParams.get('follow_status')});d={total:1,list:[{...season,progress:'看到第 1 话',new_ep:{index_show:'全 2 话'}}]};}
    else if(p==='/pgc/view/web/season')return Response.json({code:0,result:season});
    else if(p==='/pgc/player/web/v2/playurl')return s.fetch('https://api.bilibili.com/x/player/playurl?bvid='+bv+'&cid='+cid+'&qn=127&fnval=4048&fourk=1',{bypassCustomProtocolHandlers:true,headers:{Referer:'https://www.bilibili.com/'}});
    else if(p==='/x/v2/reply')d={replies:[],page:{count:0}};
    else return s.fetch(req,{bypassCustomProtocolHandlers:true});
    return Response.json({code:0,data:d});
  });
});
require(packaged?'../dist/win-unpacked/resources/app.asar/src/main.js':'../src/main');
async function until(p,label,ms=40000){const start=Date.now();while(!await p()){if(Date.now()-start>ms)throw Error('Timeout: '+label);await delay(100);}}
let win;
async function run(){
  await interceptReady;await until(()=>BrowserWindow.getAllWindows().some(w=>w.webContents.getURL()==='bili-app://shell/'),'shell');win=BrowserWindow.getAllWindows()[0];const wc=win.webContents,errors=[];wc.setBackgroundThrottling(false);wc.on('console-message',e=>{if(e.level==='error'){errors.push(e.message);console.error('Renderer:',e.message);}});const js=s=>wc.executeJavaScript(s).catch(e=>{console.error('SCRIPT:',s);throw e;});
  await until(()=>js('document.getElementById("feed-source")?.textContent==="账号推荐"'),'personal feed');const batch=feedCalls.length;
  await js('document.querySelector(".brand").click()');await until(()=>feedCalls.length>batch,'logo refresh');assert.equal(postCalls.length,0);
  await js('watch("'+bv+'")');await until(()=>js('videoState?.loggedIn && !!document.querySelector("video")'),'video');await js('document.querySelector("video").muted=true');await until(()=>js('document.querySelector("video").currentTime>1'),'real stream');assert.equal(postCalls.length,0,'opening video never mutates account');
  await until(()=>js('document.querySelectorAll(".art-control-bili-captions [data-option]").length===2'), 'subtitle toolbar tracks');
  await js('NativePlayer.current.art.controls.show=true;document.querySelector(".art-control-bili-captions .bili-player-toggle").click();document.querySelector(".art-control-bili-captions .bili-player-menu button:last-child").click()');
  await until(()=>js('document.querySelector(".bili-subtitles").textContent.includes("AI 字幕测试")'),'AI subtitle rendering');assert.equal(await js('document.querySelector(".bili-subtitles b")===null'),true);
  await js('document.querySelector(".art-control-bili-rate .bili-player-toggle").click();[...document.querySelectorAll(".art-control-bili-rate [data-option]")].find(b=>b.textContent==="1.5×").click()');
  assert.equal(await js('document.querySelector("video").playbackRate'),1.5);
  await until(()=>js('!!document.querySelector("[data-video-tag]") && !!document.querySelector("[data-chapter]")'),'rich video details');
  await js('document.querySelector("[data-chapter]").click()');
  await until(()=>heartbeat.some(h=>h.bvid===bv && h.cid===cid && h.time>=29),'heartbeat position');
  await js('document.querySelector("video").pause()');
  await new Promise(resolve=>{wc.once('did-finish-load',resolve);wc.reload();});
  await until(()=>js('!!document.getElementById("feed-source")'),'reloaded home');
  await js('navigate("history")');assert.match(await js('document.querySelector(".video-author").textContent'), /看到 0:3/);
  await js('document.querySelector(".library-grid .video-title").click()');
  await until(()=>js('document.querySelector("video")?.currentTime>=29'),'automatic resume');
  await js('document.querySelector("video").muted=true');await until(()=>js('videoState?.loggedIn'),'resumed account state');
  await js('NativePlayer.current.art.setting.show=false;document.querySelector("[data-video-action=like]").click()');await until(()=>state.like && !postCalls.length===false,'like state');await until(()=>js('!actionBusy && videoState.like'),'like UI');
  failLike=true;await js('document.querySelector("[data-video-action=like]").click()');await until(()=>js('!actionBusy && document.getElementById("toast").textContent.includes("失败")'),'like failure');assert.equal(await js('videoState.like'),true);failLike=false;
  await js('document.querySelector("[data-video-action=coin]").click()');assert.equal(state.coin,0);await js('document.querySelector("[data-close-action]").click()');assert.equal(state.coin,0);
  await js('document.querySelector("[data-video-action=coin]").click();document.querySelector(`[name=coins][value="2"]`).click();document.getElementById("video-action-form").requestSubmit()');await until(()=>js('!actionBusy && videoState.coin===2'),'coin confirmed');assert.equal(postCalls.filter(x=>x.path.endsWith('/coin/add')).length,1);
  await js('document.querySelector("[data-video-action=favorite]").click()');await until(()=>js('!!document.querySelector("[name=folder]")'),'folders');await js('document.querySelector(`[name=folder][value="10"]`).click();document.getElementById("video-action-form").requestSubmit()');await until(()=>js('!actionBusy && videoState.favorite'),'favorite');
  await js('document.querySelector("[data-video-action=follow]").click()');await until(()=>js('!actionBusy && videoState.attention'),'follow');
  await js('document.querySelector("[data-watch-tab=parts]").click()');assert.equal(await js('document.querySelectorAll("[data-part]").length'),2);await js('document.querySelector(`[data-part="2"]`).click()');assert.equal(await js('route.part'),2);
  await js('document.getElementById("collection-more").click()');await until(()=>js('document.querySelectorAll("#collection-items [data-watch]").length===3'),'full collection');
  fs.mkdirSync('test-results',{recursive:true});await js('setWebFullscreen(true);chooseWatchTab("intro")');assert.equal(await js('document.getElementById("sidebar").inert'),true);await until(()=>js('document.getElementById("workspace").getBoundingClientRect().left===0'),'immersive fills window');await js('document.getElementById("immersive-toggle").click()');assert.equal(await js('document.getElementById("sidebar").inert'),false);await delay(400);fs.writeFileSync('test-results/v24-video-actions.png',(await win.capturePage()).toPNG());
  assert.equal(await js('document.getElementById("app-back").parentElement.id'),'immersive-nav');
  await js('setWebFullscreen(false)');
  for(const collapsed of [false,true]){await js('setSidebar('+collapsed+')');await delay(350);assert.ok(await js('(()=>{const a=document.getElementById("app-back").getBoundingClientRect(),b=document.getElementById("sidebar-toggle").getBoundingClientRect(),l=document.querySelector(".brand").getBoundingClientRect();return l.bottom<=a.top && (a.right<=b.left || a.bottom<=b.top) && a.width===b.width;})()'),'logo above non-overlapping uniform navigation controls');}
  await js('navigate("anime")');await until(()=>js('!!document.querySelector(".show-card")'),'discover anime');assert.equal(animeCalls.at(-1),'1');await js('document.querySelectorAll("[data-show-filter=type]")[1].click()');await until(()=>animeCalls.at(-1)==='4','discover guochuang');
  await js('document.querySelector("[data-anime-mode=index]").click()');
  await until(()=>js('!!document.querySelector("[data-index-filter=year]")'),'index filters');
  await js('(()=>{const s=document.querySelector("[data-index-filter=year]");s.value="[2025,2026)";s.dispatchEvent(new Event("change",{bubbles:true}));})()');
  await until(()=>indexQueries.at(-1)==='[2025,2026)','selected year reaches index API');
  await js('navigate("search",{keyword:"综合测试"})');
  await until(()=>js('document.querySelectorAll(".search-section").length===3'),'all search groups');
  for(const [type,selector,query] of [['video','.video-card','video'],['user','.search-person','bili_user'],['anime','.show-card','media_bangumi']]) {
    await js(`document.querySelector('.search-tabs [data-search-tab=${type}]').click()`);
    await until(()=>js(`!!document.querySelector('#search-result ${selector}')`),'search tab '+type);
    assert.equal(searchQueries.at(-1),query);
  }
  await js('navigate("bangumi")');await until(()=>js('!!document.querySelector(".show-card")'),'bangumi list');await js('document.querySelector(`[data-show-type="2"]`).click()');await until(()=>showCalls.at(-1)?.type==='2','series filter');await js('document.querySelector(`[data-show-status="2"]`).click()');await until(()=>showCalls.at(-1)?.status==='2','watching filter');
  fs.writeFileSync('test-results/v24-shows.png',(await win.capturePage()).toPNG());await js('document.querySelector("[data-season]").click()');await until(()=>js('document.querySelectorAll(".episode-grid button").length===2'),'season episodes');fs.writeFileSync('test-results/v24-season.png',(await win.capturePage()).toPNG());
  await js('document.querySelector("[data-episode]").click()');await until(()=>js('activeVideo?.episodeId===232465 && !!document.querySelector("video")'),'native episode');await js('document.querySelector("video").muted=true');await until(()=>js('document.querySelector("video").currentTime>0.5'),'episode playback');
  await js('document.querySelector("[data-watch-tab=parts]").click();document.querySelector(`#parts-panel [data-episode="232466"]`).click()');await until(()=>js('activeVideo?.episodeId===232466'),'episode switch');
  await js('goBack()');await until(()=>js('activeVideo?.episodeId===232465'),'episode back history');
  await js('navigate("home")');loggedIn=false;await js('updateAccount()');await until(()=>js('document.getElementById("feed-source")?.textContent==="游客推荐"'),'logout guest feed');
  await js('document.getElementById("settings-button").click()');await until(()=>js('document.getElementById("settings-dialog").open'),'update settings');await js('document.getElementById("update-folder").click()');await until(()=>js('!document.getElementById("install-update").hidden && document.getElementById("update-status").textContent.includes("0.11.0")'),'verified update shown');
  assert.deepEqual(errors,[]);const report={passed:true,packaged,personalizedFeed:true,guestAfterLogout:true,postCalls:postCalls.map(x=>x.path),coinCancelNoPost:true,coinConfirmationOnce:true,likeFailureKeepsState:true,cloudFavorites:true,follow:true,aiSubtitlePlainText:true,multipart:true,fullCollection:true,bangumiFilters:true,seasonAndEpisodeNavigation:true,uniformSidebarControls:true,controlsVisible:true,historyResumed:true,authenticatedProgressSynced:true,animeDiscovery:true,immersiveSidebar:true,updatesVisible:true,historySurvivesReload:true,animeIndexFilters:true,searchTabs:true};fs.writeFileSync('test-results/features-ui'+(packaged?'-packaged':'')+'.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));app.exit(0);
}
run().catch(async e=>{console.error(e);if(win)fs.writeFileSync('test-results/v24-failure.png',(await win.capturePage()).toPNG());app.exit(1);});
