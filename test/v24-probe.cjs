const {app,session}=require('electron'),fs=require('node:fs'),path=require('node:path');
app.setPath('userData',path.resolve('.cache/v24-probe'));
app.whenReady().then(async()=>{const s=session.fromPartition('persist:probe');s.setUserAgent(s.getUserAgent().replace(/\sElectron\/\S+/g,''));
try{await s.fetch('https://www.bilibili.com/');
const req=async endpoint=>{const r=await s.fetch('https://api.bilibili.com'+endpoint,{headers:{Referer:'https://www.bilibili.com/'},signal:AbortSignal.timeout(15000)});return r.json();};
for(const endpoint of ['/x/web-interface/wbi/index/top/feed/rcmd?fresh_type=4&ps=12&fresh_idx=1&fresh_idx_1h=1&brush=1&web_location=1430650','/x/web-interface/index/top/rcmd?fresh_type=3&version=1&ps=12&fresh_idx=1','/x/web-interface/view?bvid=BV1R54y1n7wh','/pgc/view/web/season?season_id=24588']){
try{const r=await req(endpoint),d=r.data||r.result||{};fs.writeFileSync('.cache/v24-'+(endpoint.includes('rcmd')?endpoint.includes('/wbi/')?'feed':'old-feed':endpoint.includes('season')?'season':'video')+'.json',JSON.stringify(r));console.log(JSON.stringify({endpoint:endpoint.split('?')[0],code:r.code,keys:Object.keys(d),items:d.item?.length,first:d.item?.[0]?.bvid,episodes:d.episodes?.length,cid:d.cid,firstEp:d.episodes?.[0]?.id}));}catch(e){console.log(endpoint.split('?')[0],e.message);}}
const v=JSON.parse(fs.readFileSync('.cache/v24-video.json')).data;
const p=await req('/x/player/v2?bvid='+v.bvid+'&cid='+v.cid);console.log(JSON.stringify({player:p.code,cid:p.data?.cid,aid:p.data?.aid,keys:Object.keys(p.data||{}),subtitles:p.data?.subtitle}));
}catch(e){console.error(e.message)}app.exit(0);});
