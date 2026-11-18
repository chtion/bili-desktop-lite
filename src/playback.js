'use strict';
// Local UI + local DASH engine. No remote player page or remote scripts.
shaka.polyfill.installAll();
shaka.net.NetworkingEngine.registerScheme('bili-app', shaka.net.HttpFetchPlugin.parse, shaka.net.NetworkingEngine.PluginPriority.APPLICATION, true);
const NativePlayer = (() => {
  let current = null, revision = 0, suspended=false;
  function setSuspended(value){suspended=value;if(value)current?.art?.video?.pause();}
  function destroy() {
    revision++;
    const old = current; current = null;
    if (!old) return;
    old.disposed = true;
    old.engine?.destroy().catch(() => {});
    old.art?.destroy(false);
    if (old.token) window.bili.api('release-media', { token: old.token }).catch(() => {});
  }
  async function start(container, bvid, part, onStatus, episodeId) {
    destroy();
    const turn = revision;
    const state = { disposed: false, engine: null, art: null, token: null };
    current = state;
    try {
      const source = await window.bili.api('playback', { bvid, part, episodeId });
      if (turn !== revision) { window.bili.api('release-media', {token:source.token}).catch(()=>{}); return; }
      state.token = source.token;
      container.replaceChildren();
      const status = message => { if (!state.disposed) onStatus(message); };
      const loadDash = async (video, url, art) => {
        const engine = state.engine = new shaka.Player();
        engine.configure({ abr: {enabled:true}, streaming: {bufferingGoal:30,rebufferingGoal:2}, manifest:{dash:{ignoreMinBufferTime:true}} });
        engine.addEventListener('error', e => { if (e.detail.severity === shaka.util.Error.Severity.CRITICAL) status('播放连接中断，请点击重试。'); });
        try {
          await engine.attach(video);
          if (state.disposed) return;
          await engine.load(url, undefined, 'application/dash+xml');
          if (state.disposed) return;
          const seen = new Set();
          const tracks = engine.getVariantTracks().sort((a,b)=>b.height-a.height).filter(t => { if(seen.has(t.height))return false;seen.add(t.height);return true; });
          art.setting.add({name:'stream-quality',html:'画质',tooltip:'自动',selector:[{html:'自动',default:true},...tracks.map(t=>({html:`${t.height}P`,track:t}))],onSelect(item){engine.configure({abr:{enabled:!item.track}});if(item.track)engine.selectVariantTrack(item.track,true);return item.html;}});
          status('');
          if(!suspended)video.play().catch(() => status('点击播放，开始观看'));
        } catch { if (!state.disposed) status('视频加载失败，请重试或登录后再播放。'); }
      };
      state.art = new Artplayer({
        container, url: source.url, type: source.type, customType: {mpd:loadDash},
        lang:'zh-cn', theme:'#ef608d', volume:0.7, autoplay:!suspended, autoSize:false,
        setting:true, playbackRate:true, aspectRatio:true, pip:true, fullscreen:true,
        fullscreenWeb:false, hotkey:true, lock:true, moreVideoAttr:{crossOrigin:'anonymous'},
        controls:[{name:'app-fullscreen',position:'right',index:20,html:icon('expand'),tooltip:'网页全屏 / 退出',click:()=>window.dispatchEvent(new Event('toggle-web-fullscreen'))}],
        plugins:[artplayerPluginDanmuku({danmuku:async()=>{
          try {
            const {xml}=await window.bili.api('danmaku',{cid:source.cid});
            if(state.disposed)return [];
            const doc=new DOMParser().parseFromString(xml,'text/xml'), density=new Map();
            return [...doc.querySelectorAll('d')].slice(0,8000).map(d=>{const p=(d.getAttribute('p')||'').split(',');return {text:d.textContent.slice(0,120),time:Number(p[0]),mode:p[1]==='5'?1:p[1]==='4'?2:0,color:'#'+(Number(p[3])>>>0).toString(16).padStart(6,'0').slice(-6)};}).filter(d=>{
              if(!Number.isFinite(d.time))return false;
              const bucket=Math.floor(d.time/2), count=density.get(bucket)||0;
              density.set(bucket,count+1);return count<3;
            });
          } catch { return []; }
        },emitter:false,antiOverlap:true,fontSize:20,opacity:0.8,margin:[12,'50%'],synchronousPlayback:true})]
      });
      state.art.on('video:playing',()=>{if(suspended)state.art.video.pause();status('');});
      state.art.on('error',()=>status('视频暂时无法播放，请点击重试。'));
      const captions=document.createElement('div');captions.className='bili-subtitles';captions.setAttribute('aria-live','off');state.art.template.$player.append(captions);
      state.subtitleCues=[];state.subtitleRevision=0;
      state.art.on('video:timeupdate',()=>{const t=state.art.video.currentTime;captions.textContent=state.subtitleCues.filter(c=>c.from<=t&&c.to>t).slice(0,3).map(c=>c.text).join('\n');});
      window.bili.api('subtitle-tracks',{bvid:source.bvid,cid:source.cid,aid:source.aid,episodeId}).then(result=>{
        if(state.disposed)return;
        const choices=[{html:'关闭',default:true},...result.tracks.map(t=>({html:esc(t.label)+(t.ai?' · AI':''),track:t}))];
        state.art.setting.add({name:'bili-subtitles',html:'字幕',tooltip:result.tracks.length?'关闭':result.needLogin?'登录后查看':'暂无可用字幕',selector:choices,onSelect(item){
          const rev=++state.subtitleRevision;state.subtitleCues=[];captions.textContent='';
          if(item.track)window.bili.api('subtitle-content',{token:item.track.token}).then(d=>{if(!state.disposed&&rev===state.subtitleRevision)state.subtitleCues=d.cues;}).catch(e=>{if(!state.disposed)state.art.notice.show=e.message;});
          return item.html;
        }});
      }).catch(()=>{if(!state.disposed)state.art.setting.add({name:'bili-subtitles',html:'字幕',tooltip:'暂不可用，重试播放可重新获取'});});
    } catch (e) { if(turn===revision)onStatus(e.message); }
  }
  return { start, destroy, setSuspended, get current(){return current;} };
})();
