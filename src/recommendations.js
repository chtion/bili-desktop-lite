'use strict';
const {normalizeVideo}=require('./navigation');
function createRecommendations(api,wbi,account){
  return async page=>{
    try{
      const [r,a]=await Promise.all([wbi('/x/web-interface/wbi/index/top/feed/rcmd',{fresh_type:4,ps:24,fresh_idx:page,fresh_idx_1h:page,brush:page,web_location:1430650,feed_version:'V8',homepage_ver:1}),account()]);
      const items=(r.item||[]).filter(v=>v.goto==='av' && !v.ad_info && !v.is_ad).map(normalizeVideo).filter(v=>v.bvid);
      if(!items.length)throw new Error('推荐内容为空');
      const personalized=a.loggedIn && Number(r.mid)===a.mid;
      return {items,more:true,source:personalized?'account':'guest',note:personalized?'根据当前 B站账号推荐':a.loggedIn?'B站本次返回游客推荐，可稍后刷新':'登录后获取账号推荐'};
    }catch{
      const r=await api(`/x/web-interface/popular?pn=${page}&ps=24`);
      return {items:(r.list||[]).map(normalizeVideo).filter(v=>v.bvid),more:!r.no_more,source:'popular',note:'推荐服务暂不可用，暂时展示热门视频'};
    }
  };
}
module.exports={createRecommendations};
