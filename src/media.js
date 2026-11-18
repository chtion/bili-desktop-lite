'use strict';
const { randomUUID } = require('node:crypto');
const xml = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
function mediaURL(value) {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' && !u.username && !u.password && !u.port && ['bilivideo.com','bilivideo.cn','bilivideo.net'].some(h => u.hostname === h || u.hostname.endsWith('.'+h)) ? u.href : '';
  } catch { return ''; }
}
function createMediaService(getSession) {
  const resources = new Map();
  const release = (group) => { for (const [key, entry] of resources) if (entry.group === group) resources.delete(key); };
  function prepare(data) {
    // Expire stale manifests; URLs and cookies never enter the renderer.
    for (const [key, entry] of resources) if (Date.now() - entry.created > 7200000) resources.delete(key);
    const group = randomUUID();
    const add = (entry, extension = '') => {
      const key = randomUUID() + extension;
      resources.set(key, { ...entry, group, created: Date.now() });
      return `bili-app://shell/media/${key}`;
    };
    const proxy = (track) => {
      const sources = [track.baseUrl || track.base_url || track.url, ...(track.backupUrl || track.backup_url || [])].map(mediaURL).filter(Boolean);
      if (!sources.length) throw new Error('这个视频暂时没有可用的播放线路。');
      // Prefer standard CDN hosts to peer-assisted CDN endpoints.
      sources.sort((a,b) => Number(a.includes('.mcdn.')) - Number(b.includes('.mcdn.')));
      return add({ sources });
    };
    try {
      if (!data.dash) {
        if (data.durl?.length === 1 && !/\.flv(?:\?|$)/i.test(data.durl[0].url)) return { token: group, url: proxy(data.durl[0]), type: 'mp4', qualities: [] };
        throw new Error('该内容暂未提供可用的视频流，请登录后重试。');
      }
      const video = (data.dash.video || []).filter(t => /^avc1/.test(t.codecs));
      const audio = (data.dash.audio || []).filter(t => /^mp4a/.test(t.codecs)).sort((a,b) => b.bandwidth-a.bandwidth).slice(0,1);
      if (!video.length) throw new Error('该视频暂未提供当前设备可播放的格式。');
      const representation = (t, type) => {
        const segment = t.SegmentBase || t.segment_base;
        const initial = segment?.Initialization || segment?.initialization;
        const range = segment?.indexRange || segment?.index_range;
        if (!/^\d+-\d+$/.test(initial) || !/^\d+-\d+$/.test(range)) throw new Error('视频分段信息不完整，请重试。');
        return `<Representation id="${type}-${Number(t.id)}" bandwidth="${Number(t.bandwidth)}" codecs="${xml(t.codecs)}" ${type === 'video' ? `width="${Number(t.width)}" height="${Number(t.height)}"` : 'audioSamplingRate="44100"'}><BaseURL>${xml(proxy(t))}</BaseURL><SegmentBase indexRange="${range}"><Initialization range="${initial}"/></SegmentBase></Representation>`;
      };
      const duration = Number(data.dash.duration);
      if (!(duration > 0)) throw new Error('视频时长信息不完整。');
      const manifest = `<?xml version="1.0" encoding="UTF-8"?><MPD xmlns="urn:mpeg:dash:schema:mpd:2011" type="static" profiles="urn:mpeg:dash:profile:isoff-on-demand:2011" minBufferTime="PT1.5S" mediaPresentationDuration="PT${duration}S"><Period duration="PT${duration}S"><AdaptationSet contentType="video" mimeType="video/mp4" segmentAlignment="true">${video.map(t=>representation(t,'video')).join('')}</AdaptationSet>${audio.length ? `<AdaptationSet contentType="audio" mimeType="audio/mp4" lang="zh"><AudioChannelConfiguration schemeIdUri="urn:mpeg:dash:23003:3:audio_channel_configuration:2011" value="2"/>${audio.map(t=>representation(t,'audio')).join('')}</AdaptationSet>` : ''}</Period></MPD>`;
      return { token: group, url: add({ manifest }, '.mpd'), type: 'mpd', qualities: video.map(t=>({id:t.id,height:t.height})), hasAudio: !!audio.length };
    } catch (e) { release(group); throw e; }
  }
  async function handle(request) {
    const key = new URL(request.url).pathname.slice('/media/'.length);
    const entry = resources.get(key);
    if (!entry) return new Response('Expired', {status:404});
    if (entry.manifest) return new Response(entry.manifest,{headers:{'Content-Type':'application/dash+xml','Cache-Control':'no-store'}});
    const range = request.headers.get('range');
    if (range && !/^bytes=\d+-\d*$/.test(range)) return new Response('',{status:416});
    for (const source of entry.sources) {
      try {
        const response = await getSession().fetch(source,{headers:{Referer:'https://www.bilibili.com/',...(range?{Range:range}:{})},signal:AbortSignal.any([request.signal,AbortSignal.timeout(45000)])});
        if (![200,206].includes(response.status)) { await response.body?.cancel(); continue; }
        const headers = new Headers({'Content-Type':response.headers.get('content-type') || 'video/mp4','Cache-Control':'no-store'});
        for (const h of ['content-range','content-length','accept-ranges']) if (response.headers.has(h)) headers.set(h,response.headers.get(h));
        return new Response(response.body,{status:response.status,headers});
      } catch { if (request.signal.aborted) break; }
    }
    return new Response('Media unavailable',{status:502});
  }
  return { prepare, handle, release };
}
module.exports = { createMediaService, mediaURL };
