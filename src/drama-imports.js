'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const https=require('node:https');
const {lookup}=require('node:dns');
const {isIP}=require('node:net');
const {Readable}=require('node:stream');
const {randomUUID,createHash}=require('node:crypto');
const {plainText}=require('./navigation');

const maxCatalog=2*1024*1024;
const pageSize=36;
const hash=value=>createHash('sha256').update(value).digest('hex').slice(0,32);
const imported=id=>typeof id==='string'&&/^source-[a-f0-9]{32}$/.test(id);

function publicURL(value,base) {
  try {
    const url=new URL(value,base);
    const host=url.hostname.toLowerCase();
    if(url.protocol!=='https:'||url.username||url.password||url.port||isIP(host.replace(/^\[|\]$/g,''))||
       !host.includes('.')||host.endsWith('.')||/\.(?:localhost|local|internal|test|invalid|home|lan)$/.test(host))return '';
    url.hash='';
    return url.href.length<=4096?url.href:'';
  }catch{return '';}
}

function publicAddress(address) {
  if(isIP(address)===6)return /^[23]/.test(address)&&!/^2001:(?:db8|0):/i.test(address);
  if(isIP(address)!==4)return false;
  const [a,b,c]=address.split('.').map(Number);
  return a>0&&a<224&&![10,127].includes(a)&&
    !(a===100&&b>=64&&b<=127)&&!(a===169&&b===254)&&!(a===172&&b>=16&&b<=31)&&
    !(a===192&&(b===168||(b===0&&[0,2].includes(c))))&&!(a===198&&([18,19].includes(b)||(b===51&&c===100)))&&!(a===203&&b===0&&c===113);
}

function safeLookup(host,options,callback) {
  lookup(host,{all:true},(error,answers)=>{
    if(error)return callback(error);
    const allowed=answers.filter(item=>publicAddress(item.address)&&(!options.family||options.family===item.family));
    if(!allowed.length)return callback(new Error('站源需使用公网 HTTPS 地址。'));
    if(options.all)return callback(null,allowed);
    callback(null,allowed[0].address,allowed[0].family);
  });
}

async function publicGet(value,{signal,range}={},attempt=0) {
  const href=publicURL(value);
  if(!href)throw new Error('站源需使用公网 HTTPS 地址。');
  const reply=await new Promise((resolve,reject)=>{
    const request=https.get(href,{lookup:safeLookup,signal,headers:{'User-Agent':'Bili-Lite',...(range?{Range:range}:{})}},resolve);
    request.once('error',reject);
  });
  if([301,302,303,307,308].includes(reply.statusCode)&&reply.headers.location&&attempt<3){
    reply.destroy();
    return publicGet(publicURL(reply.headers.location,href),{signal,range},attempt+1);
  }
  const headers=new Headers();
  for(const name of ['content-type','content-length','content-range','accept-ranges']){
    if(reply.headers[name])headers.set(name,reply.headers[name]);
  }
  const status=reply.statusCode;
  const body=[204,205,304].includes(status)?null:Readable.toWeb(reply);
  if(!body)reply.resume();
  return {response:new Response(body,{status,headers}),href};
}

async function boundedText(response) {
  if(!response.ok||!response.body){
    await response.body?.cancel();throw new Error(`站源返回 HTTP ${response.status}。`);
  }
  if(Number(response.headers.get('content-length'))>maxCatalog){
    await response.body.cancel();throw new Error('文件或订阅超过 2 MB。');
  }
  const reader=response.body.getReader(),decoder=new TextDecoder();
  let size=0,text='';
  try{
    for(;;){
      const {done,value}=await reader.read();
      if(done)break;
      size+=value.length;
      if(size>maxCatalog)throw new Error('文件或订阅超过 2 MB。');
      text+=decoder.decode(value,{stream:true});
    }
    return text+decoder.decode();
  }finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
}

function playlistEntries(text) {
  let current={};
  const items=[];
  for(const line of text.split(/\r?\n/).map(line=>line.trim()).filter(Boolean)){
    if(line.startsWith('#EXTINF:')){
      const label=line.match(/^#EXTINF:(?:[^",]|"[^"]*")*,(.*)$/)?.[1]?.trim();
      current={title:label,cover:line.match(/tvg-logo="([^"]+)"/)?.[1],category:line.match(/group-title="([^"]+)"/)?.[1]};
    }else if(!line.startsWith('#')){
      items.push({...current,url:line});current={};
    }
  }
  return items;
}

function parseCatalog(text,sourceId,fallback,base) {
  const content=text.replace(/^\uFEFF/,'').trim();
  let input;
  if(/^\s*[\[{]/.test(content)){
    try{input=JSON.parse(content);}catch{throw new Error('JSON 格式有误。');}
  }else if(base&&content.startsWith('#EXTM3U')&&/^#EXT-X-/m.test(content)){
    input=[{title:fallback,url:base,format:'hls'}];
  }else input=playlistEntries(content);
  const raw=Array.isArray(input)?input:input?.items;
  if(!Array.isArray(raw)||!raw.length)throw new Error('没有找到可导入的剧目。');
  const collection=new Map();
  for(const item of raw.slice(0,1500)){
    const title=plainText(item?.title).slice(0,140);
    const entries=Array.isArray(item?.episodes)?item.episodes:[item];
    const episodes=new Map();
    for(const [index,rawEpisode] of entries.slice(0,500).entries()){
      const url=publicURL(rawEpisode?.url,base);
      if(!url)continue;
      const format=rawEpisode.format==='hls'||/\.m3u8(?:[?#]|$)/i.test(url)?'hls':rawEpisode.format==='mp4'||/\.mp4(?:[?#]|$)/i.test(url)?'mp4':'';
      if(!format)continue;
      const key=String(rawEpisode.id||new URL(url).origin+new URL(url).pathname).slice(0,260);
      const number=Number.isSafeInteger(rawEpisode.number)&&rawEpisode.number>0?rawEpisode.number:index+1;
      const episodeId='episode-'+hash(key+':'+number);
      episodes.set(episodeId,{id:episodeId,url,format,number,title:plainText(rawEpisode.title).slice(0,100),playable:true});
    }
    if(!episodes.size)continue;
    const identity=String(item.id||title||new URL(episodes.values().next().value.url).pathname).slice(0,240);
    const seriesId='series-'+hash(identity);
    const display=title||path.posix.basename(new URL(episodes.values().next().value.url).pathname)||'短剧';
    if(collection.has(seriesId)){
      const known=collection.get(seriesId);
      known.episodes=[...new Map([...known.episodes,...episodes.values()].map(episode=>[episode.id,episode])).values()];
      known.count=known.episodes.length;
      continue;
    }
    collection.set(seriesId,{id:seriesId,sourceId,title:display,description:plainText(item.description),
      cover:publicURL(item.cover,base),category:plainText(item.category).slice(0,32),episodes:[...episodes.values()],count:episodes.size});
  }
  if(!collection.size)throw new Error('请提供指向 MP4 或 HLS 的公网 HTTPS 链接。');
  return {name:plainText(input?.name).slice(0,70)||fallback,items:[...collection.values()]};
}

function sectionPage(items,offset=0) {
  const next=offset+pageSize;
  return {items:items.slice(offset,next),cursor:next<items.length?String(next):''};
}

function summary({episodes,...data}) {return data;}
function playableEpisode({url,format,...data}) {return data;}

function createDramaImports(directory,request=publicGet) {
  const store=path.join(directory,'drama-library.json');
  let loaded;
  let queue=Promise.resolve();
  const generations=new Map();
  const media=new Map();
  const sourceList=async()=>{
    loaded??=fs.readFile(store,'utf8').then(value=>JSON.parse(value)).then(value=>Array.isArray(value)?value:[])
      .catch(error=>{if(error.code==='ENOENT')return [];throw error;});
    return loaded;
  };
  const info=source=>({id:source.id,name:source.name,count:source.items.length,updated:source.updated,kind:source.kind});
  const list=async()=> (await sourceList()).map(info);
  function sync(mutator) {
    const operation=queue.then(async()=>{
      const next=await mutator(await sourceList()),payload=JSON.stringify(next);
      if(Buffer.byteLength(payload)>12*maxCatalog||next.length>30)throw new Error('剧库容量已满，请移除不常用的来源。');
      await fs.mkdir(directory,{recursive:true});
      const temporary=store+'.tmp';
      await fs.writeFile(temporary,payload,'utf8');
      await fs.rename(temporary,store);
      loaded=Promise.resolve(next);
      return next.map(info);
    });
    queue=operation.catch(()=>{});
    return operation;
  }

  async function update(kind,location) {
    const id='source-'+hash(kind+':'+location);
    const revision=(generations.get(id)||0)+1;
    generations.set(id,revision);
    let text, base;
    if(kind==='url'){
      const fetched=await request(location,{signal:AbortSignal.timeout(18000)});
      text=await boundedText(fetched.response);base=fetched.href||location;
    }else{
      const file=await fs.open(location,'r');
      try{
        const stats=await file.stat();
        if(!stats.isFile()||stats.size>maxCatalog)throw new Error('请选择 2 MB 以内的 JSON 或 M3U 文件。');
        text=await file.readFile('utf8');
      }finally{await file.close();}
    }
    const fallback=kind==='url'?new URL(location).hostname:path.basename(location,path.extname(location));
    const result=parseCatalog(text,id,fallback,base);
    return sync(sources=>{
      if(generations.get(id)!==revision)return sources;
      const next={id,kind,location,updated:Date.now(),...result};
      return sources.some(source=>source.id===id)?sources.map(source=>source.id===id?next:source):[...sources,next];
    });
  }
  async function command(action,value) {
    if(action==='list')return list();
    if(action==='subscribe'){
      const url=publicURL(value);
      if(!url)throw new Error('请输入公网 HTTPS 订阅地址。');
      return update('url',url);
    }
    const source=(await sourceList()).find(source=>source.id===value);
    if(!source)throw new Error('这个站源已移除。');
    if(action==='refresh')return update(source.kind,source.location);
    if(action==='remove'){
      generations.set(value,(generations.get(value)||0)+1);
      return sync(sources=>sources.filter(entry=>entry.id!==value));
    }
    throw new Error('未知站源操作。');
  }

  function startMedia(episode) {
    for(const [id,entry] of media)if(entry.expires<Date.now())media.delete(id);
    const token=randomUUID(),expires=Date.now()+6*60*60*1000;
    media.set(token,{expires,entries:[{url:episode.url,format:episode.format}],urls:new Map()});
    return {url:`bili-app://shell/import-media/${token}/0${episode.format==='hls'?'.m3u8':'.mp4'}`,type:episode.format,token};
  }
  async function browse(method,data) {
    const source=(await sourceList()).find(source=>source.id===data.sourceId);
    if(!source)throw new Error('这个站源已移除。');
    const offset=Math.max(0,Math.min(Number.parseInt(data.cursor,10)||0,2000));
    if(method==='catalog'){
      const word=String(data.keyword||'').trim().toLowerCase();
      const category={human:'真人',comic_series_rank:'漫',ai_playlet:'ai'}[data.category];
      const items=source.items.filter(item=>(!word||[item.title,item.description,item.category].some(value=>value.toLowerCase().includes(word)))&&
        (!category||item.category.toLowerCase().includes(category)));
      return sectionPage(items.map(summary),offset);
    }
    const series=source.items.find(item=>item.id===data.seriesId);
    if(!series)throw new Error('这个剧目已不在站源中。');
    if(method==='playback'){
      const episode=series.episodes.find(item=>item.id===data.episodeId);
      if(!episode)throw new Error('找不到这一集。');
      return startMedia(episode);
    }
    const episodes=sectionPage(series.episodes.map(playableEpisode),offset);
    if(method==='detail')return {series:summary(series),...episodes};
    if(method==='episodes')return episodes;
    throw new Error('未知剧库操作。');
  }

  function rewritePlaylist(text,href,token,entry) {
    if(!text.trimStart().startsWith('#EXTM3U'))throw new Error('站源没有提供普通 HLS 播放列表。');
    function register(value,format) {
      const url=publicURL(value,href);
      if(!url||entry.entries.length>=30000)throw new Error('播放列表无效。');
      const key=format+':'+url;
      if(!entry.urls.has(key)){
        entry.urls.set(key,entry.entries.length);
        entry.entries.push({url,format});
      }
      return `bili-app://shell/import-media/${token}/${entry.urls.get(key)}${format==='hls'?'.m3u8':'.bin'}`;
    }
    let variant=false;
    return text.split(/\r?\n/).map(line=>{
      const value=line.trim();
      if(!value)return line;
      if(value.startsWith('#')){
        if(/^#EXT-X-(?:SESSION-)?KEY:(?!METHOD=NONE(?:,|$))/.test(value))throw new Error('该节目需要站源授权播放。');
        if(value.startsWith('#EXT-X-STREAM-INF:'))variant=true;
        return line.replace(/\bURI="([^"]+)"/g,(_all,uri)=>`URI="${register(uri,/^#EXT-X-(?:MEDIA|I-FRAME-STREAM-INF):/.test(value)?'hls':'segment')}"`);
      }
      const result=register(value,variant||/\.m3u8(?:[?#]|$)/i.test(value)?'hls':'segment');
      variant=false;
      return result;
    }).join('\n');
  }
  async function handleMedia(input) {
    const [, ,token,index]=new URL(input.url).pathname.split('/');
    const entry=media.get(token);
    const file=entry?.entries[Number.parseInt(index,10)];
    if(!entry||entry.expires<Date.now()||!file)return new Response('',{status:404});
    const range=input.headers.get('range');
    if(range&&!/^bytes=\d+-\d*$/.test(range))return new Response('',{status:416});
    try{
      const {response,href}=await request(file.url,{signal:AbortSignal.any([input.signal,AbortSignal.timeout(30000)]),range});
      if(file.format==='hls'){
        const list=await boundedText(response);
        return new Response(rewritePlaylist(list,href,token,entry),{headers:{'Content-Type':'application/vnd.apple.mpegurl','Cache-Control':'no-store'}});
      }
      const contentType=response.headers.get('content-type')||'';
      if(![200,206].includes(response.status)||/^(?:text\/|application\/(?:json|xml))/i.test(contentType)||
         file.format==='mp4'&&contentType&&!/^(?:video\/mp4|application\/octet-stream)(?:;|$)/i.test(contentType)){
        await response.body?.cancel();return new Response('',{status:502});
      }
      const headers=new Headers(response.headers);
      if(file.format==='mp4')headers.set('content-type','video/mp4');
      headers.set('cache-control','no-store');
      return new Response(response.body,{headers,status:response.status});
    }catch{return new Response('',{status:502});}
  }
  async function handleImage(input) {
    const url=new URL(input.url).searchParams.get('url');
    try{
      const {response}=await request(url,{signal:AbortSignal.any([input.signal,AbortSignal.timeout(10000)])});
      const type=response.headers.get('content-type')||'';
      if(!response.ok||!/^image\/(?:png|jpeg|webp|avif|gif)(?:;|$)/i.test(type)||Number(response.headers.get('content-length'))>8000000){
        await response.body?.cancel();return new Response('',{status:404});
      }
      return new Response(response.body,{headers:{'Content-Type':type,'Cache-Control':'private, max-age=3600'}});
    }catch{return new Response('',{status:502});}
  }
  async function files(paths) {
    const errors=[];
    for(const file of paths){
      try{await update('file',file);}catch(error){errors.push(path.basename(file)+'：'+error.message);}
    }
    return {sources:await list(),errors};
  }
  return {command,browse,files,handleMedia,handleImage,release:token=>media.delete(token)};
}

module.exports={createDramaImports,imported,parseCatalog,publicURL};
