'use strict';
const {normalizeVideo,imageURL,plainText}=require('./navigation');
function positive(n){return Number.isSafeInteger(Number(n))&&Number(n)>0?Number(n):0;}
function normalizeEpisode(e){return {episodeId:positive(e.id),aid:positive(e.aid),bvid:e.bvid,cid:positive(e.cid),title:[e.title,e.long_title].filter(Boolean).join(' · '),cover:imageURL(e.cover),duration:Math.round(Number(e.duration||0)/1000),badge:plainText(e.badge)};}
function showCard(s) {
  return {id:positive(s.season_id),title:plainText(s.title),cover:imageURL(s.cover),update:plainText(s.index_show || s.new_ep?.index_show),progress:plainText(s.progress),rating:String(s.rating?.score || s.score || ''),badge:plainText(s.badge)};
}
const indexFields=new Set(['season_version','spoken_language_type','area','is_finish','copyright','season_status','season_month','year','style_id']);
function createShows(api,account){
  const indexCache=new Map();
  async function indexFilters(type) {
    const cached=indexCache.get(type);
    if(cached&&Date.now()<cached.expires)return cached.task;
    const task=api(`/pgc/season/index/condition?season_type=${type}&type=1`).then(result=>({
      sections:(result.filter||[]).filter(row=>indexFields.has(row.field)).map(row=>({key:row.field,label:plainText(row.name),options:(row.values||[]).slice(0,100).map(option=>({value:String(option.keyword),label:plainText(option.name)}))}))
    })).catch(error=>{indexCache.delete(type);throw error;});
    indexCache.set(type,{task,expires:Date.now()+1800000});
    return task;
  }
  async function season(data){
    const id=positive(data.seasonId),ep=positive(data.episodeId);if(!id&&!ep)throw new Error('无效的番剧编号。');
    const s=await api('/pgc/view/web/season?'+(ep?'ep_id='+ep:'season_id='+id));
    const sections=[{title:s.positive?.title||'正片',episodes:s.episodes||[]},...(s.section||[]).map(x=>({title:x.title,episodes:x.episodes||[]}))];
    return {id:positive(s.season_id),showType:positive(s.type)||1,title:plainText(s.title),cover:imageURL(s.cover),description:String(s.evaluate||'').slice(0,12000),styles:(s.styles||[]).join(' · '),rating:String(s.rating?.score||''),update:plainText(s.new_ep?.desc),followed:!!s.user_status?.follow,lastEpisode:positive(s.user_status?.progress?.last_ep_id),sections:sections.map(g=>({title:plainText(g.title),items:g.episodes.map(normalizeEpisode).filter(e=>e.episodeId)}))};
  }
  return {
    season,
    filters(data) {return indexFilters(Number(data.type)===4?4:1);},
    async discover(data,page) {
      const type=Number(data.type)===4?4:1;
      const order=data.order==='new'?0:data.order==='rating'?4:2;
      const finish=data.finish!=null&&[0,1].includes(Number(data.finish))?Number(data.finish):-1;
      const params=new URLSearchParams({season_type:type,is_finish:finish,order,sort:0,page,pagesize:20,type:1});
      if(data.index&&data.filters&&typeof data.filters==='object') {
        const available=await indexFilters(type);
        for(const section of available.sections) {
          const requested=String(data.filters[section.key]??'-1');
          if(section.options.some(option=>option.value===requested))params.set(section.key,requested);
        }
      }
      const items=await api('/pgc/season/index/result?'+params);
      return {items:(items.list||[]).map(showCard).filter(item=>item.id),more:items.has_next===1||items.has_next===true,total:Number(items.total)||0};
    },
    async list(data,page){
      const a=await account();if(!a.loggedIn)throw new Error('登录后可同步你的追番和追剧列表。');
      const type=Number(data.type)===2?2:1,status=[0,1,2,3].includes(Number(data.status))?Number(data.status):0;
      const r=await api(`/x/space/bangumi/follow/list?type=${type}&follow_status=${status}&pn=${page}&ps=20&vmid=${a.mid}`);
      return {total:Number(r.total)||0,more:page*20<Number(r.total),items:(r.list||[]).map(showCard).filter(item=>item.id)};
    },
    async episode(data){
      const s=await season(data),e=s.sections.flatMap(x=>x.items).find(x=>x.episodeId===positive(data.episodeId));if(!e)throw new Error('没有找到这一集。');
      return {...normalizeVideo({aid:e.aid,bvid:e.bvid,cid:e.cid,title:s.title+' · '+e.title,pic:e.cover||s.cover,duration:e.duration,author:s.title}),kind:'episode',episodeId:e.episodeId,seasonId:s.id,showType:s.showType,seasonFollowed:s.followed,description:s.description,category:s.styles,showRating:s.rating,showUpdate:s.update,pages:[{page:1,cid:e.cid,title:e.title,duration:e.duration}],collection:{id:s.id,title:s.title,kind:'episode',count:s.sections.reduce((n,g)=>n+g.items.length,0),sections:s.sections},coinLimit:0};
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
