const {app, session}=require('electron');
app.setPath('userData',require('node:path').resolve('.cache/probe-profile'));
app.whenReady().then(async()=>{
 const s=session.fromPartition('persist:probe');
 try {
  await s.fetch('https://www.bilibili.com/',{signal:AbortSignal.timeout(15000)});
  for(const path of ['/x/web-interface/popular?pn=1&ps=4','/x/web-interface/search/type?search_type=video&keyword=Unity&page=1','/x/web-interface/ranking/v2?rid=0&type=all','/x/web-interface/nav']){
   try {const r=await s.fetch('https://api.bilibili.com'+path,{headers:{Referer:'https://www.bilibili.com/'},signal:AbortSignal.timeout(15000)});const j=await r.json();console.log(JSON.stringify({path,status:r.status,code:j.code,message:j.message,keys:Object.keys(j.data||{}),sample:JSON.stringify(j.data?.list?.[0]||j.data?.result?.[0]||{}).slice(0,1800)}));}catch(e){console.log(path,e.message);}
  }
 }catch(e){console.error(e.message);}
 app.exit(0);
});
