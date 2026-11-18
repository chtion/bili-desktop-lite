'use strict';
const PlaybackProgress=(()=>{
  const key=(bvid,episodeId)=>episodeId?`ep${episodeId}`:bvid;
  const entry=(bvid,episodeId)=>history.find(item=>key(item.bvid,item.episodeId)===key(bvid,episodeId));

  function startTime(bvid,episodeId,cid) {
    const record=entry(bvid,episodeId)?.positions?.[cid];
    return record&&!record.done&&record.time>=2?record.time:0;
  }

  function track(state,metadata,part,video) {
    let lastSave=0,lastSync=0,hasPlayed=false,recordedTime=-1,completed=false;
    const source=state.source;

    function save(action='playing') {
      if(!hasPlayed||!Number.isFinite(video.duration)||video.duration<=0||video.seeking&&action==='playing')return;
      const time=Math.floor(video.currentTime),total=Math.floor(video.duration),now=Date.now();
      if(action==='end')completed=true;
      if(time!==recordedTime||action==='end') {
        const old=entry(source.bvid,source.episodeId),prior=old?.positions||{};
        const positions=Object.fromEntries([[String(source.cid),{time,total,done:completed}],...Object.entries(prior).filter(([id])=>id!==String(source.cid))].slice(0,150));
        const item={...metadata,bvid:source.bvid,episodeId:source.episodeId,part,cid:source.cid,time,total,done:completed,positions};
        history=[item,...history.filter(item=>key(item.bvid,item.episodeId)!==key(source.bvid,source.episodeId))].slice(0,100);
        storage.write('history',history);
        recordedTime=time;
      }
      if(appPreferences.historySync&&state.syncEnabled&& (action!=='playing'||now-lastSync>=15000)) {
        lastSync=now;
        return window.bili.api('progress',{token:source.token,time,duration:total,action:completed?'end':action}).then(result=>{
          const label=$('history-sync-status');
          if(!state.disposed&&label)label.textContent=({synced:'已同步到 B站',guest:'进度已保存 · 登录后可同步',unavailable:'进度已保存在本机 · B站暂未同步',disabled:'进度已保存在本机'})[result.status]||'';
        }).catch(()=>{});
      }
    }

    video.addEventListener('playing',()=>{hasPlayed=true;if(!video.ended)completed=false;});
    video.addEventListener('timeupdate',()=>{
      if(!video.paused&&video.currentTime>=1&&Date.now()-lastSave>=4000){lastSave=Date.now();save();}
    });
    video.addEventListener('seeked',()=>{if(video.currentTime<video.duration-1)completed=false;save('seek');});
    video.addEventListener('pause',()=>save(video.ended?'end':'pause'));
    video.addEventListener('ended',()=>save('end'));
    return save;
  }

  return {entry,startTime,track};
})();
window.addEventListener('beforeunload',()=>NativePlayer.flushProgress());
