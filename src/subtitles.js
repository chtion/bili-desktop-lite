'use strict';
const {randomUUID}=require('node:crypto');
function subtitleURL(value){
  try{const u=new URL(String(value||'').replace(/^\/\//,'https://'));return u.protocol==='https:' && !u.username && !u.password && !u.port && ['hdslb.com','biliimg.com','subtitle.bilibili.com'].some(h=>u.hostname===h||u.hostname.endsWith('.'+h))?u.href:'';}catch{return '';}
}
function normalizeCues(body){return (Array.isArray(body)?body:[]).slice(0,30000).map(c=>({from:Number(c.from),to:Number(c.to),text:String(c.content||'').slice(0,2000)})).filter(c=>Number.isFinite(c.from)&&Number.isFinite(c.to)&&c.from>=0&&c.to>c.from&&c.text).sort((a,b)=>a.from-b.from);}
function createSubtitles(apiWbi,getSession){
  const tracks=new Map();
  return {
    async list({bvid,cid,aid,episodeId}){
      const data=await apiWbi('/x/player/wbi/v2',{bvid,cid,...(episodeId?{ep_id:episodeId}:{})});
      if(Number(data.cid)!==Number(cid) || (data.aid && Number(data.aid)!==Number(aid)))throw new Error('字幕信息与当前视频不匹配，已停止加载。');
      for(const [token,t] of tracks)if(Date.now()-t.time>3600000)tracks.delete(token);
      return {needLogin:!!data.need_login_subtitle,tracks:(data.subtitle?.subtitles||[]).flatMap(s=>{
        const url=subtitleURL(s.subtitle_url);if(!url)return [];
        const token=randomUUID();tracks.set(token,{url,time:Date.now()});
        return [{token,label:String(s.lan_doc||s.lan||'字幕').slice(0,50),language:String(s.lan||'').slice(0,30),ai:Number(s.ai_type)>0 || /^ai-/.test(s.lan||'')}];
      })};
    },
    async content(token){
      const track=tracks.get(String(token));if(!track || Date.now()-track.time>3600000)throw new Error('字幕已过期，请重新打开视频。');
      const r=await getSession().fetch(track.url,{headers:{Referer:'https://www.bilibili.com/'},signal:AbortSignal.timeout(15000)});
      if(!r.ok)throw new Error('字幕暂时无法加载，请重试。');
      return {cues:normalizeCues((await r.json()).body)};
    }
  };
}
module.exports={subtitleURL,normalizeCues,createSubtitles};
