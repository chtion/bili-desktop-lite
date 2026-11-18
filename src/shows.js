'use strict';
const {normalizeVideo,imageURL,plainText}=require('./navigation');
function positive(n){return Number.isSafeInteger(Number(n))&&Number(n)>0?Number(n):0;}
function normalizeEpisode(e){return {episodeId:positive(e.id),aid:positive(e.aid),bvid:e.bvid,cid:positive(e.cid),title:[e.title,e.long_title].filter(Boolean).join(' · '),cover:imageURL(e.cover),duration:Math.round(Number(e.duration||0)/1000),badge:plainText(e.badge)};}
function createShows(api,account){
  async function season(data){
    const id=positive(data.seasonId),ep=positive(data.episodeId);if(!id&&!ep)throw new Error('无效的番剧编号。');
    const s=await api('/pgc/view/web/season?'+(ep?'ep_id='+ep:'season_id='+id));
    const sections=[{title:s.positive?.title||'正片',episodes:s.episodes||[]},...(s.section||[]).map(x=>({title:x.title,episodes:x.episodes||[]}))];
    return {id:positive(s.season_id),title:plainText(s.title),cover:imageURL(s.cover),description:String(s.evaluate||'').slice(0,12000),styles:(s.styles||[]).join(' · '),rating:String(s.rating?.score||''),update:plainText(s.new_ep?.desc),followed:!!s.user_status?.follow,lastEpisode:positive(s.user_status?.progress?.last_ep_id),sections:sections.map(g=>({title:plainText(g.title),items:g.episodes.map(normalizeEpisode).filter(e=>e.episodeId)}))};
  }
  return {
    season,
    async list(data,page){
      const a=await account();if(!a.loggedIn)throw new Error('登录后可同步你的追番和追剧列表。');
      const type=Number(data.type)===2?2:1,status=[0,1,2,3].includes(Number(data.status))?Number(data.status):0;
      const r=await api(`/x/space/bangumi/follow/list?type=${type}&follow_status=${status}&pn=${page}&ps=20&vmid=${a.mid}`);
      return {total:Number(r.total)||0,more:page*20<Number(r.total),items:(r.list||[]).map(s=>({id:positive(s.season_id),title:plainText(s.title),cover:imageURL(s.cover),update:plainText(s.new_ep?.index_show),progress:plainText(s.progress),rating:String(s.rating?.score||''),badge:plainText(s.badge),description:String(s.evaluate||'').slice(0,500)}))};
    },
    async episode(data){
      const s=await season(data),e=s.sections.flatMap(x=>x.items).find(x=>x.episodeId===positive(data.episodeId));if(!e)throw new Error('没有找到这一集。');
      return {...normalizeVideo({aid:e.aid,bvid:e.bvid,cid:e.cid,title:s.title+' · '+e.title,pic:e.cover||s.cover,duration:e.duration,author:s.title}),kind:'episode',episodeId:e.episodeId,seasonId:s.id,seasonFollowed:s.followed,description:s.description,category:s.styles,pages:[{page:1,cid:e.cid,title:e.title,duration:e.duration}],collection:{id:s.id,title:s.title,kind:'episode',count:s.sections.reduce((n,g)=>n+g.items.length,0),sections:s.sections},coinLimit:0};
    },
    async play(data){
      const ep=positive(data.episodeId);if(!ep)throw new Error('无效的剧集编号。');
      const d=await api(`/pgc/player/web/v2/playurl?ep_id=${ep}&qn=127&fnval=4048&fourk=1`),v=d.video_info||d;
      if(v.is_drm || (!v.dash && !v.durl))throw new Error('该剧集未提供可用的视频流，可能需要登录、会员权限或官方播放器。');
      return v;
    }
  };
}
module.exports={positive,normalizeEpisode,createShows};
