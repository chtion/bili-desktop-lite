'use strict';
const {imageURL,normalizeVideo,plainText}=require('./navigation');
const categories={video:'video',user:'bili_user',anime:'media_bangumi'};

function cleanUser(result) {
  return {mid:Number(result.mid)||0,name:plainText(result.uname||result.name),avatar:imageURL(result.upic||result.face),sign:plainText(result.usign||result.sign),fans:Number(result.fans)||0,videos:Number(result.videos)||0};
}
function cleanShow(result) {
  const published=Number(result.pubtime);
  return {id:Number(result.season_id)||0,title:plainText(result.title),cover:imageURL(result.cover),
    update:plainText(result.index_show||result.season_type_name),badge:plainText(result.badges?.[0]?.text||result.season_type_name),
    rating:String(result.media_score?.score||result.score||''),description:plainText(result.desc),year:published>0?new Date(published*1000).getFullYear():null};
}
function normalize(type,list) {
  const mapper=type==='video'?normalizeVideo:type==='user'?cleanUser:cleanShow;
  return (Array.isArray(list)?list:[]).map(mapper).filter(item=>item.bvid||item.mid>0||item.id>0);
}

function createSearch(api,wbi) {
  async function typed(type,keyword,page,order) {
    const params={search_type:categories[type],keyword,page,...(type==='video'?{order}:{})};
    let result;
    try {result=await api('/x/web-interface/search/type?'+new URLSearchParams(params));}
    catch {result=await wbi('/x/web-interface/wbi/search/type',params);}
    if(result?.v_voucher)throw new Error('B站暂未开放本次搜索，请稍后重试或登录后再试。');
    if(!result||(!Array.isArray(result.result)&&Number(result.numResults)!==0))throw new Error('搜索内容暂时无法读取。');
    return {items:normalize(type,result.result),total:Number(result.numResults)||0,more:page<Number(result.numPages)};
  }

  return async function search(data,page) {
    const keyword=typeof data.keyword==='string'?data.keyword.trim():'';
    if(!keyword||keyword.length>160)throw new Error('请输入 1–160 个字的搜索内容。');
    const order=['totalrank','click','pubdate'].includes(data.order)?data.order:'totalrank';
    const type=Object.hasOwn(categories,data.searchType)?data.searchType:'all';
    if(type!=='all')return typed(type,keyword,page,order);
    let result;
    try {result=await wbi('/x/web-interface/wbi/search/all/v2',{keyword,page:1});}
    catch {result=await api('/x/web-interface/search/all/v2?'+new URLSearchParams({keyword,page:1}));}
    if(!Array.isArray(result?.result))throw new Error('B站暂未返回综合搜索结果，可切换到分类搜索。');
    const limits={video:12,user:4,anime:6};
    const groups={};
    for(const [name,source] of Object.entries(categories)) {
      const rows=result.result.find(group=>group.result_type===source)?.data;
      groups[name]=normalize(name,rows).slice(0,limits[name]);
    }
    return {groups,total:Number(result.numResults)||0};
  };
}
module.exports={createSearch};
