'use strict';
const {randomUUID}=require('node:crypto');
const WEB='https://www.bilibili.com/';

function createHistorySync(getSession) {
  const streams=new Map();

  async function sessionIdentity() {
    const cookies=await getSession().cookies.get({url:WEB});
    const value=name=>cookies.find(cookie=>cookie.name===name)?.value;
    const mid=value('DedeUserID'),session=value('SESSDATA'),csrf=value('bili_jct');
    return /^\d+$/.test(mid||'') && session && csrf ? {mid,session,csrf} : null;
  }

  function start(source, metadata) {
    for(const [token,stream] of streams)if(Date.now()-stream.lastTouch>86400000)streams.delete(token);
    streams.set(source.token,{
      ...metadata,
      id:randomUUID().replaceAll('-',''),
      started:Math.floor(Date.now()/1000),
      lastTouch:Date.now(),
      identity:sessionIdentity().catch(()=>null),
      lastPosition:null,
      queue:Promise.resolve()
    });
  }

  function update(data) {
    const stream=streams.get(data.token);
    if(!stream)return {status:'unavailable'};
    const position=Math.floor(Number(data.time)),duration=Math.floor(Number(data.duration));
    if(!Number.isFinite(position)||!Number.isFinite(duration)||position<0||duration<=0||position>duration+1||duration>86400)return {status:'unavailable'};
    const action=['playing','pause','leave','end'].includes(data.action)?data.action:'playing';
    const played=action==='end'?-1:position;
    stream.lastTouch=Date.now();
    const report=stream.queue.then(async()=>{
      if(stream.lastPosition===played)return {status:'synced'};
      const original=await stream.identity,current=await sessionIdentity();
      if(!original||!current||original.mid!==current.mid||original.session!==current.session)return {status:'guest'};
      const episode=!!stream.episodeId;
      const seconds=Math.max(0,Math.floor(Date.now()/1000)-stream.started);
      const fields={aid:stream.aid,bvid:stream.bvid,cid:stream.cid,mid:current.mid,played_time:played,
        realtime:seconds,start_ts:stream.started,type:episode?4:3,sub_type:episode?stream.showType||1:0,dt:2,
        session:stream.id,last_play_progress_time:position,video_duration:duration,
        play_type:action==='end'?4:action==='pause'||action==='leave'?2:0,csrf:current.csrf};
      if(episode){fields.epid=stream.episodeId;fields.sid=stream.seasonId;}
      const response=await getSession().fetch('https://api.bilibili.com/x/click-interface/web/heartbeat',{
        method:'POST',credentials:'include',redirect:'error',
        headers:{Referer:episode?`${WEB}bangumi/play/ep${stream.episodeId}`:`${WEB}video/${stream.bvid}/`,'Content-Type':'application/x-www-form-urlencoded'},
        body:new URLSearchParams(fields).toString(),signal:AbortSignal.timeout(4500)
      });
      if(!response.ok||(await response.json()).code!==0)return {status:'unavailable'};
      stream.lastPosition=played;
      return {status:'synced'};
    }).catch(()=>({status:'unavailable'}));
    stream.queue=report;
    return report;
  }

  return {start,update,release:token=>streams.delete(token)};
}
module.exports={createHistorySync};
