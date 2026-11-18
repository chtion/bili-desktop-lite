'use strict';
const {imageURL,normalizeVideo,plainText} = require('./navigation');
function createPersonalAPI(api, accountInfo) {
  const positive = n => Number.isSafeInteger(Number(n)) && Number(n)>0 ? Number(n) : 0;
  async function own() { const a=await accountInfo(); if (!a.loggedIn) throw new Error('请先登录 B站，查看你的账号内容。'); return a; }
  return async function personal(method,data,page) {
    switch(method) {
      case 'favorite-folders': {
        const a=await own(); const result=await api(`/x/v3/fav/folder/created/list-all?up_mid=${a.mid}`);
        return {folders:(result.list||[]).map(f=>({id:positive(f.id),title:plainText(f.title),count:Number(f.media_count)||0})).filter(f=>f.id)};
      }
      case 'favorites': {
        await own(); const id=positive(data.folder); if(!id)throw new Error('请选择一个收藏夹。');
        const r=await api(`/x/v3/fav/resource/list?media_id=${id}&pn=${page}&ps=20&order=mtime&type=0&tid=0&platform=web`);
        return {items:(r.medias||[]).map(v=>normalizeVideo({...v,pic:v.cover,owner:{name:v.upper?.name,face:v.upper?.face,mid:v.upper?.mid},stat:{view:v.cnt_info?.play,danmaku:v.cnt_info?.danmaku}})).filter(v=>v.bvid),more:!!r.has_more,total:Number(r.info?.media_count)||0};
      }
      case 'profile': {
        const mid=positive(data.mid)||(await own()).mid;
        const r=await api(`/x/web-interface/card?mid=${mid}`); const c=r.card||{};
        return {mid,name:plainText(c.name),avatar:imageURL(c.face),sign:String(c.sign||'').slice(0,1000),level:Number(c.level_info?.current_level)||0,followers:Number(c.fans)||0,following:Number(c.attention)||0,videos:Number(r.archive_count)||0};
      }
      case 'uploads': {
        const mid=positive(data.mid)||(await own()).mid;
        const r=await api(`/x/series/recArchivesByKeywords?mid=${mid}&keywords=&orderby=senddate&pn=${page}&ps=30`);
        return {items:(r.archives||[]).map(v=>normalizeVideo({...v,owner:{mid}})).filter(v=>v.bvid),more:page*30<Number(r.page?.total),total:Number(r.page?.total)||0};
      }
      case 'dynamics': {
        const a=await own(); const offset=String(data.offset||'').slice(0,80);
        const r=await api(`/x/polymer/web-dynamic/v1/feed/space?host_mid=${a.mid}&offset=${encodeURIComponent(offset)}`);
        return {offset:String(r.offset||''),more:!!r.has_more,items:(r.items||[]).map(item=>{
          const m=item.modules||{},d=m.module_dynamic||{},u=m.module_author||{},v=d.major?.archive;
          return {id:String(item.id_str),name:plainText(u.name),avatar:imageURL(u.face),time:plainText(u.pub_time),text:String(d.desc?.text||d.major?.opus?.summary?.text||d.major?.article?.title||'').slice(0,12000),images:(d.major?.draw?.items||d.major?.opus?.pics||[]).slice(0,9).map(i=>imageURL(i.src||i.url)).filter(Boolean),video:v?normalizeVideo({bvid:v.bvid,title:v.title,pic:v.cover,author:u.name,duration:v.duration_text,play:v.stat?.play}):null};
        })};
      }
      default: throw new Error('不支持这个操作。');
    }
  };
}
module.exports={createPersonalAPI};
