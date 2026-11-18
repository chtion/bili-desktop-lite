'use strict';
const {app,session}=require('electron'),path=require('node:path'),fs=require('node:fs'),assert=require('node:assert/strict');
const {createSearch}=require('../src/search'),{createWbi}=require('../src/wbi'),{createRecommendations}=require('../src/recommendations'),{createSubtitles}=require('../src/subtitles'),{createShows}=require('../src/shows'),{createMediaService}=require('../src/media');
app.setPath('userData',path.resolve('.cache/v24-services'));
app.whenReady().then(async()=>{
  try{
    const s=session.fromPartition('persist:services');s.setUserAgent(s.getUserAgent().replace(/\sElectron\/\S+/g,''));await s.fetch('https://www.bilibili.com/');
    async function api(endpoint,allowGuest=false){const r=await s.fetch('https://api.bilibili.com'+endpoint,{headers:{Referer:'https://www.bilibili.com/'},signal:AbortSignal.timeout(18000)}),j=await r.json();if(allowGuest&&j.code===-101)return {...j.data,isLogin:false};if(j.code!==0)throw Error('B站接口 '+j.code+' '+j.message);return j.data??j.result;}
    const wbi=createWbi(api),rec=createRecommendations(api,wbi,async()=>({loggedIn:false})),subtitle=createSubtitles(wbi,()=>s),shows=createShows(api,async()=>({loggedIn:false}));
    const feed=await rec(1);assert.equal(feed.source,'guest');assert.ok(feed.items.length>0);
    const view=await api('/x/web-interface/view?bvid=BV1R54y1n7wh'),sub=await subtitle.list({bvid:view.bvid,aid:view.aid,cid:view.cid});
    const anime=await shows.discover({type:1},1);assert.ok(anime.items.length>0);
    const guochuang=await shows.discover({type:4,finish:0},1);assert.ok(guochuang.items.length>0);
    const filters=await shows.filters({type:1});assert.ok(filters.sections.some(f=>f.key==='year'));
    const indexed=await shows.discover({type:1,index:true,filters:{year:'[2025,2026)',area:'2'}},1);assert.ok(indexed.items.length>0);
    const search=createSearch(api,wbi);
    const [all,searchedVideos,searchedUsers,searchedShows]=await Promise.all([search({keyword:'工作细胞'},1),search({keyword:'工作细胞',searchType:'video'},1),search({keyword:'哔哩哔哩',searchType:'user'},1),search({keyword:'工作细胞',searchType:'anime'},1)]);
    assert.ok(all.groups.video.length&&all.groups.anime.length);assert.ok(searchedVideos.items.length&&searchedUsers.items.length&&searchedShows.items.length);
    const detail=await api('/x/web-interface/view/detail?bvid='+view.bvid);assert.equal(detail.View?.bvid,view.bvid);
    const github=await s.fetch('https://api.github.com/repos/chtion/bili-desktop-lite/releases/latest',{credentials:'omit',headers:{'User-Agent':'BiliDesktopLite'},signal:AbortSignal.timeout(9000)}).then(response=>response.status).catch(()=>0);
    const season=await shows.season({seasonId:24588});assert.ok(season.sections[0].items.length>1);
    let episode;try{const p=await shows.play({episodeId:season.sections[0].items[0].episodeId}),media=createMediaService(()=>s),prepared=media.prepare(p);episode={available:true,type:prepared.type,qualities:prepared.qualities};media.release(prepared.token);}catch(e){episode={available:false,message:e.message};}
    const report={passed:true,recommendationSource:feed.source,recommendations:feed.items.length,subtitleTracks:sub.tracks.length,subtitleNeedsLogin:sub.needLogin,anime:anime.items.length,guochuang:guochuang.items.length,videoTags:detail.Tags?.length,animeIndexConditions:filters.sections.length,animeIndexResults:indexed.items.length,search:{all:all.groups.video.length,video:searchedVideos.items.length,user:searchedUsers.items.length,anime:searchedShows.items.length},githubReleasesStatus:github,seasonTitle:season.title,episodeCount:season.sections.reduce((n,g)=>n+g.items.length,0),episode};fs.writeFileSync('test-results/live-services.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));app.exit(0);
  }catch(e){console.error(e);app.exit(1);}
});
