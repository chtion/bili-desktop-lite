'use strict';
const HOME = 'https://www.bilibili.com/';
function isBiliURL(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && (!url.port || url.port === '443') && (url.hostname === 'bilibili.com' || url.hostname.endsWith('.bilibili.com') || url.hostname === 'b23.tv');
  } catch { return false; }
}
function videoId(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (/^BV[1-9A-HJ-NP-Za-km-z]{10}$/.test(text)) return text;
  if (!isBiliURL(text)) return '';
  return new URL(text).pathname.match(/^\/video\/(BV[1-9A-HJ-NP-Za-km-z]{10})(?:\/|$)/)?.[1] || '';
}
function imageURL(value) {
  try {
    const url = new URL(String(value || '').replace(/^\/\//, 'https://').replace(/^http:/, 'https:'));
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return '';
    if (!['hdslb.com', 'biliimg.com'].some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`))) return '';
    return url.href;
  } catch { return ''; }
}
function plainText(value) {
  return String(value || '').replace(/<[^>]*>/g, '').replace(/&(?:amp|lt|gt|quot|#39);/g, (s) => ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" })[s]).slice(0, 500);
}
function normalizeVideo(value) {
  return { aid: Number(value.aid || value.id) || 0, authorMid: Number(value.owner?.mid || value.mid) || 0, bvid: videoId(value.bvid), title: plainText(value.title), cover: imageURL(value.pic), author: plainText(value.owner?.name || value.author), avatar: imageURL(value.owner?.face || value.upic), views: Number(value.stat?.view ?? value.play) || 0, danmaku: Number(value.stat?.danmaku ?? value.video_review) || 0, likes: Number(value.stat?.like ?? value.like) || 0, coins:Number(value.stat?.coin)||0, favorites:Number(value.stat?.favorite)||0, shares:Number(value.stat?.share)||0, duration: typeof value.duration === 'number' ? value.duration : String(value.duration || ''), category: plainText(value.tname || value.typename || value.tname_v2), published: Number(value.pubdate || value.created) || 0, reason: plainText(value.rcmd_reason?.content) };
}
function resolveInput(value) {
  const text = String(value ?? '').trim();
  if (!text) return HOME;
  const candidate = /^https?:\/\//i.test(text) ? text : `https://${text}`;
  if (isBiliURL(candidate)) return new URL(candidate).href;
  return `https://search.bilibili.com/all?keyword=${encodeURIComponent(text)}`;
}
module.exports = { HOME, isBiliURL, videoId, imageURL, plainText, normalizeVideo, resolveInput };
