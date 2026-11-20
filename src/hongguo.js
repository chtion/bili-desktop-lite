'use strict';
const path = require('node:path');
const {randomUUID} = require('node:crypto');
const {plainText} = require('./navigation');

const origin = 'https://hongguoduanju.com';
const categories = new Set(['all','human','comic_series_rank','ai_playlet']);
const searchFilters = {human:'content_type_short_play',comic_series_rank:'content_type_dynamic_comic',ai_playlet:'content_type_ai_dynamic_comic'};
const catalogGenres = {human:'short_play',comic_series_rank:'comic_series',ai_playlet:'ai_series'};
const imageHosts = ['fqnovelpic.com','byteimg.com','bytegecko.com','snssdk.com','ibytedtos.com'];
const videoHosts = ['byte-vod.com','bytefcdn.com','volcvod.com','zjcdn.com','fqnovelvod.com'];
const id = value => typeof value==='string' && /^\d{10,24}$/.test(value) ? value : '';
const cursor = value => typeof value==='string' && value.length<=512*1024 ? value : undefined;

function cdnURL(value, hosts) {
  try {
    const url = new URL(value);
    if(url.protocol==='https:' && !url.port && !url.username && !url.password &&
       hosts.some(host=>url.hostname.endsWith('.'+host)))return url.href;
  } catch {}
  return '';
}

function show(raw) {
  return {id:id(raw?.id)||id(raw?.series_id),title:plainText(raw?.title).slice(0,160),description:plainText(raw?.description),
    cover:cdnURL(raw?.cover_url,imageHosts),count:Number(raw?.episode_count)||0,category:plainText(raw?.category).slice(0,30)};
}

function episode(raw) {
  return {id:id(raw?.id),number:Number(raw?.number)||0,title:plainText(raw?.title).slice(0,100),playable:raw?.playable===true};
}

function page(result, map) {
  const entries = new Map();
  for(const raw of result?.items||[]){
    const item=map(raw);
    if(item.id&&!entries.has(item.id))entries.set(item.id,item);
  }
  return {items:[...entries.values()],cursor:result?.has_more?cursor(result.cursor)||'':'',more:result?.has_more===true};
}

function officialURL(seriesId,episodeId) {
  if(!id(seriesId))throw new Error('无法识别这部短剧。');
  return episodeId&&id(episodeId)?`${origin}/player/${seriesId}/${episodeId}`:`${origin}/detail?series_id=${seriesId}`;
}

function sourceError(error) {
  if(error.code==='ANONYMOUS_LIMITED')return '当前站源限制匿名访问，请稍后重试。';
  if(error.code==='RATE_LIMITED')return '红果请求过于频繁，请稍后重试。';
  if(error.code==='CONTENT_UNAVAILABLE')return '红果暂时无法提供这部短剧。';
  return '红果 App 源暂时无法连接，请稍后重试。';
}

function createHongguo({directory,network,loadSDK=()=>import('openhongguo')}) {
  let clientTask;
  const media = new Map(), knownEpisodes = new Map(), requests = new Map();
  function client() {
    clientTask??=loadSDK().then(module=>module.createClient({
      profile:path.join(directory,'hongguo-anonymous.json'),timeoutMs:12000,retryAttempts:1,deviceResets:0
    })).catch(error=>{clientTask=null;throw error;});
    return clientTask;
  }

  async function catalog(api,data) {
    const offset=cursor(data.cursor), query=String(data.keyword||'').trim().slice(0,100);
    const sort=categories.has(data.category)?data.category:'all';
    if(query)return page(await api.search(query,{pageSize:20,cursor:offset,filters:searchFilters[sort]?[searchFilters[sort]]:undefined}),show);
    if(data.section==='recommended')return page(await api.discover({cursor:offset}),show);
    const genre=catalogGenres[sort];
    return page(await api.shortFilter({selections:genre?{genre:[genre]}:undefined,cursor:offset}),show);
  }

  async function listEpisodes(api,seriesId,offset) {
    const result=page(await api.listEpisodes(seriesId,{cursor:offset,pageSize:50}),episode);
    for(const item of result.items)knownEpisodes.set(item.id,{seriesId,playable:item.playable});
    while(knownEpisodes.size>4000)knownEpisodes.delete(knownEpisodes.keys().next().value);
    return result;
  }

  async function playback(api,seriesId,episodeId) {
    const entry=knownEpisodes.get(episodeId);
    if(entry?.seriesId!==seriesId||!entry.playable)return {message:'该集需在红果官方观看。'};
    let model;
    try {
      ({playback:model}=await api.resolvePlayback(episodeId));
    } catch(error) {
      if(['ANONYMOUS_LIMITED','AUTHENTICATION_REQUIRED','CONTENT_UNAVAILABLE'].includes(error.code)){
        return {message:'红果暂未向当前客户端开放这集的内播，请前往官方观看。'};
      }
      throw error;
    }
    const streams=(model?.streams||[]).filter(stream=>!stream.hls&&!stream.dash&&
      stream.protected!==true&&(!model.protected||stream.protected===false)&&
      (!stream.codec||/^(?:h[.]?264|avc)/i.test(stream.codec))).sort((a,b)=>(Number(b.height)||0)-(Number(a.height)||0));
    const urls=streams.flatMap(stream=>[stream.url,stream.backup_url]).map(value=>cdnURL(value,videoHosts)).filter(Boolean);
    if(!urls.length)return {message:'这集没有适用于当前播放器的视频流，请前往官方观看。'};
    const now=Date.now(), expires=Number(model.expires_at)*1000;
    for(const [key,entry] of media)if(entry.expires<=now)media.delete(key);
    if(expires>0&&expires<=now)return {message:'播放地址已过期，请重试。'};
    const token=randomUUID();
    media.set(token,{urls:[...new Set(urls)],expires:Math.min(expires||Infinity,now+60*60*1000)});
    return {url:`bili-app://shell/drama-media/${token}.mp4`,type:'mp4',token};
  }

  async function request(method,data={}) {
    const seriesId=id(data.seriesId), episodeId=id(data.episodeId);
    if(method!=='catalog'&&!seriesId)throw new Error('无法识别这部短剧。');
    if(method==='playback'&&!episodeId)throw new Error('无法识别这一集。');
    if(!['catalog','detail','episodes','playback'].includes(method))throw new Error('无效的红果操作。');
    const key=JSON.stringify([method,seriesId,episodeId,data.section,data.category,cursor(data.cursor),String(data.keyword||'').slice(0,100)]);
    if(method!=='playback'&&requests.has(key))return requests.get(key);
    const task=(async()=>{
      const api=await client();
      if(method==='catalog')return catalog(api,data);
      if(method==='playback')return playback(api,seriesId,episodeId);
      const episodes=listEpisodes(api,seriesId,cursor(data.cursor));
      if(method==='episodes')return episodes;
      const [series,list]=await Promise.all([api.getSeries(seriesId),episodes]);
      return {series:show(series),...list};
    })().catch(error=>{throw new Error(sourceError(error));}).finally(()=>requests.delete(key));
    if(method!=='playback')requests.set(key,task);
    return task;
  }

  async function handleMedia(request) {
    const token=new URL(request.url).pathname.split('/').at(-1).replace(/\.mp4$/,'');
    const entry=media.get(token);
    if(!entry||entry.expires<=Date.now())return new Response('',{status:404});
    const range=request.headers.get('range');
    if(range&&!/^bytes=\d+-\d*$/.test(range))return new Response('',{status:416});
    for(const url of entry.urls){
      try {
        const response=await network.fetch(url,{headers:range?{Range:range}:{},credentials:'omit',redirect:'error',
          signal:AbortSignal.any([request.signal,AbortSignal.timeout(30000)])});
        const type=response.headers.get('content-type');
        if(![200,206].includes(response.status)||(type&&!/^(?:video\/mp4|application\/octet-stream)(?:;|$)/i.test(type))){
          await response.body?.cancel();continue;
        }
        const headers=new Headers({'Content-Type':'video/mp4','Cache-Control':'no-store'});
        for(const name of ['content-range','content-length','accept-ranges']){
          if(response.headers.has(name))headers.set(name,response.headers.get(name));
        }
        return new Response(response.body,{status:response.status,headers});
      }catch{if(request.signal.aborted)break;}
    }
    return new Response('',{status:502});
  }

  async function handleImage(request) {
    const url=cdnURL(new URL(request.url).searchParams.get('url'),imageHosts);
    if(!url)return new Response('',{status:404});
    try {
      const response=await network.fetch(url,{credentials:'omit',redirect:'error',signal:AbortSignal.any([request.signal,AbortSignal.timeout(12000)])});
      const type=response.headers.get('content-type')||'';
      const heic=/^image\/hei[cf](?:;|$)/i.test(type);
      const size=Number(response.headers.get('content-length'));
      if(!response.ok||(!heic&&!/^image\/(?:png|jpe?g|webp|avif|gif)(?:;|$)/i.test(type))||size>(heic?4000000:12000000)){
        await response.body?.cancel();return new Response('',{status:404});
      }
      const headers=new Headers({'Content-Type':type,'Cache-Control':'private, max-age=3600'});
      if(!heic)return new Response(response.body,{headers});
      const buffer=Buffer.from(await response.arrayBuffer());
      if(buffer.length>4000000)return new Response('',{status:404});
      const jpeg=await require('heic-convert')({buffer,format:'JPEG',quality:0.86});
      headers.set('Content-Type','image/jpeg');
      return new Response(jpeg,{headers});
    }catch{return new Response('',{status:502});}
  }

  return {request,handleMedia,handleImage,release:token=>media.delete(token)};
}

module.exports={createHongguo,officialURL};
