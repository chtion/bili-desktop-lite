const {app,session}=require('electron');const fs=require('node:fs'),path=require('node:path');
app.setPath('userData',path.resolve('.cache/v22-probe'));
app.whenReady().then(async()=>{const s=session.fromPartition('persist:probe');try{
await s.fetch('https://www.bilibili.com/',{signal:AbortSignal.timeout(10000)});
const req=async url=>(await s.fetch('https://api.bilibili.com'+url,{headers:{Referer:'https://www.bilibili.com/'},signal:AbortSignal.timeout(15000)})).json();
const v=await req('/x/web-interface/view?bvid=BV1R54y1n7wh');
const p=await req('/x/player/playurl?bvid=BV1R54y1n7wh&cid='+v.data.cid+'&qn=80&fnval=4048&fourk=1');
fs.writeFileSync('.cache/playurl-probe.json',JSON.stringify(p));
console.log(JSON.stringify({code:p.code,keys:Object.keys(p.data||{}),quality:p.data?.quality,duration:p.data?.dash?.duration,video:p.data?.dash?.video?.map(v=>({id:v.id,codecs:v.codecs,host:new URL(v.baseUrl||v.base_url).hostname,segment:v.SegmentBase||v.segment_base})),audio:p.data?.dash?.audio?.map(a=>({id:a.id,codecs:a.codecs}))}));
}catch(e){console.error(e.message)}app.exit(0)});
