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
    old.saveProgress?.('leave');
    old.disposed = true;
    old.menuEvents?.abort();
    old.engine?.destroy().catch(() => {});
    old.art?.destroy(false);
    if (old.token) window.bili.api('release-media', { token: old.token }).catch(() => {});
  }
  function playerMenu(state,label,items,choose,selected=0) {
    const root=document.createElement('div');root.className='bili-player-picker';
    const toggle=document.createElement('button');toggle.type='button';toggle.className='bili-player-toggle';
    toggle.textContent=label;toggle.setAttribute('aria-expanded','false');
    const list=document.createElement('div');list.className='bili-player-menu';list.hidden=true;
    function close(){list.hidden=true;toggle.setAttribute('aria-expanded','false');}
    toggle.addEventListener('click',()=>{
      const opening=list.hidden;dismissMenu();
      if(opening){list.hidden=false;toggle.setAttribute('aria-expanded','true');state.closeMenu=close;}
    });
    function replace(options,selected=0) {
      list.replaceChildren(...options.map((item,index)=>{
        const button=document.createElement('button');button.type='button';button.textContent=item.label;
        button.disabled=!!item.disabled;button.dataset.option=String(index);
        button.setAttribute('aria-pressed',String(index===selected));
        button.addEventListener('click',()=>{
          for(const entry of list.children)entry.setAttribute('aria-pressed',String(entry===button));
          choose(item);close();
        });
        return button;
      }));
    }
    root.append(toggle,list);replace(items,selected);
    return {root,toggle,replace};
  }
  function dismissMenu() {
    if(!current?.closeMenu)return false;
    current.closeMenu();current.closeMenu=null;return true;
  }
  async function start(container, bvid, part, onStatus, episodeId, metadata) {
    destroy();
    const turn = revision;
    const state = { disposed: false, engine: null, art: null, token: null };
    current = state;
    try {
      const source = await window.bili.api('playback', { bvid, part, episodeId });
      if (turn !== revision) { window.bili.api('release-media', {token:source.token}).catch(()=>{}); return; }
      state.token = source.token;
      state.source=source;
      state.syncEnabled=source.syncEnabled;
      const startAt=PlaybackProgress.startTime(source.bvid,source.episodeId,source.cid);
      container.replaceChildren();
      const status = message => { if (!state.disposed) onStatus(message); };
      const loadDash = async (video, url, art) => {
        const engine = state.engine = new shaka.Player();
        engine.configure({ abr: {enabled:true}, streaming: {bufferingGoal:30,rebufferingGoal:2}, manifest:{dash:{ignoreMinBufferTime:true}} });
        engine.addEventListener('error', e => { if (e.detail.severity === shaka.util.Error.Severity.CRITICAL) status('播放连接中断，请点击重试。'); });
        try {
          await engine.attach(video);
          if (state.disposed) return;
          await engine.load(url, startAt||undefined, 'application/dash+xml');
          if (state.disposed) return;
          const seen = new Set();
          const tracks = engine.getVariantTracks().sort((a,b)=>b.height-a.height).filter(t => { if(seen.has(t.height))return false;seen.add(t.height);return true; });
          art.setting.add({name:'stream-quality',html:'画质',tooltip:'自动',selector:[{html:'自动',default:true},...tracks.map(t=>({html:`${t.height}P`,track:t}))],onSelect(item){engine.configure({abr:{enabled:!item.track}});if(item.track)engine.selectVariantTrack(item.track,true);return item.html;}});
          status('');
          if(!suspended)video.play().catch(() => status('点击播放，开始观看'));
        } catch { if (!state.disposed) status('视频加载失败，请重试或登录后再播放。'); }
      };
      const speeds=[0.5,0.75,1,1.25,1.5,1.75,2];
      const rate=playerMenu(state,'倍速',speeds.map(speed=>({label:`${speed}×`,speed})),item=>{state.art.playbackRate=item.speed;},2);
      let selectSubtitle=()=>{};
      const subtitles=playerMenu(state,'字幕',[{label:'正在加载字幕…',disabled:true}],item=>selectSubtitle(item));
      state.art = new Artplayer({
        container, url: source.url, type: source.type, customType: {mpd:loadDash},
        lang:'zh-cn', theme:'#ef608d', volume:0.7, autoplay:!suspended, autoSize:false,
        setting:true, playbackRate:false, aspectRatio:true, pip:true, fullscreen:true,
        fullscreenWeb:false, hotkey:true, lock:true, moreVideoAttr:{crossOrigin:'anonymous'},
        controls:[{name:'bili-rate',position:'right',index:14,html:rate.root},{name:'bili-captions',position:'right',index:15,html:subtitles.root},{name:'app-fullscreen',position:'right',index:20,html:icon('expand'),tooltip:'网页全屏 / 退出',click:()=>window.dispatchEvent(new Event('toggle-web-fullscreen'))}],
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
      const video=state.art.video;
      state.menuEvents=new AbortController();
      document.addEventListener('pointerdown',event=>{if(!event.target.closest('.bili-player-picker'))dismissMenu();},{signal:state.menuEvents.signal});
      state.saveProgress=PlaybackProgress.track(state,metadata,part,video);
      if(startAt){
        if(source.type!=='mpd')video.addEventListener('loadedmetadata',()=>{if(startAt<video.duration-2)video.currentTime=startAt;},{once:true});
        video.addEventListener('playing',()=>{if(Math.abs(video.currentTime-startAt)<3)state.art.notice.show=`已续播至 ${duration(startAt)}`;},{once:true});
      }
      video.addEventListener('ratechange',()=>{rate.toggle.textContent=video.playbackRate===1?'倍速':`${video.playbackRate}×`;});
      state.art.on('error',()=>status('视频暂时无法播放，请点击重试。'));
      const captions=document.createElement('div');captions.className='bili-subtitles';captions.setAttribute('aria-live','off');state.art.template.$player.append(captions);
      state.subtitleCues=[];state.subtitleRevision=0;
      state.art.on('video:timeupdate',()=>{const t=state.art.video.currentTime;captions.textContent=state.subtitleCues.filter(c=>c.from<=t&&c.to>t).slice(0,3).map(c=>c.text).join('\n');});
      selectSubtitle=item=>{
        const rev=++state.subtitleRevision;state.subtitleCues=[];captions.textContent='';
        subtitles.toggle.classList.toggle('enabled',!!item.track);
        if(item.track)window.bili.api('subtitle-content',{token:item.track.token}).then(d=>{
          if(!state.disposed&&rev===state.subtitleRevision){state.subtitleCues=d.cues;video.dispatchEvent(new Event('timeupdate'));}
        }).catch(e=>{if(!state.disposed&&rev===state.subtitleRevision)state.art.notice.show=e.message;});
      };
      window.bili.api('subtitle-tracks',{bvid:source.bvid,cid:source.cid,aid:source.aid,episodeId}).then(result=>{
        if(state.disposed)return;
        const choices=result.tracks.length?[{label:'关闭'},...result.tracks.map(track=>({label:track.label+(track.ai?' · AI':''),track}))]:[{label:result.needLogin?'登录后查看字幕':'暂无可用字幕',disabled:true}];
        subtitles.replace(choices);
        renderPlayerDetails(result);
      }).catch(()=>{if(!state.disposed)subtitles.replace([{label:'暂时无法加载字幕',disabled:true}]);});
    } catch (e) { if(turn===revision)onStatus(e.message); }
  }
  return { start, destroy, setSuspended, dismissMenu, flushProgress:()=>current?.saveProgress?.('leave'), get current(){return current;} };
})();
