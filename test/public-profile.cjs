const {app,BrowserWindow,session}=require('electron'),path=require('node:path');
const {setTimeout:delay}=require('node:timers/promises');
app.setPath('userData',path.resolve('.cache/v22-public-test'));require('../src/main');
app.whenReady().then(async()=>{try{
  for(let i=0;i<100;i++){if(BrowserWindow.getAllWindows()[0]?.webContents.getURL()==='bili-app://shell/')break;await delay(100);}
  const wc=BrowserWindow.getAllWindows()[0].webContents;
  await delay(600);
  console.log(JSON.stringify(await wc.executeJavaScript(`(async()=>{const v=await window.bili.api('video',{bvid:'BV1R54y1n7wh'});const results={mid:v.authorMid};for(const method of ['profile','uploads']){try{const d=await window.bili.api(method,{mid:v.authorMid,page:1});results[method]={ok:true,count:d.items?.length,name:d.name};}catch(e){results[method]={error:e.message};}}return results;})()`)));
  const s=session.fromPartition('persist:bilibili');
  for(const endpoint of ['/x/series/recArchivesByKeywords?mid=668721344&keywords=&orderby=senddate&pn=1&ps=30','/x/polymer/web-dynamic/v1/feed/space?host_mid=668721344']) {
    try{const r=await s.fetch('https://api.bilibili.com'+endpoint,{headers:{Referer:'https://www.bilibili.com/'},signal:AbortSignal.timeout(15000)});const d=await r.json();console.log(JSON.stringify({endpoint:endpoint.split('?')[0],status:r.status,code:d.code,keys:Object.keys(d.data||{}),first:d.data?.archives?.[0],count:d.data?.items?.length}));}catch(e){console.log(e.message);}
  }
}catch(e){console.error(e.message);}app.exit(0);});
