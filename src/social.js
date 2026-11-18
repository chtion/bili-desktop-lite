'use strict';
const {videoId}=require('./navigation');
const {positive}=require('./shows');
function createSocial(api,account,getSession){
  const pending=new Set();
  async function identity(){const a=await account();if(!a.loggedIn)throw new Error('请先登录 B站，再进行这个操作。');return a;}
  async function post(endpoint,values){
    const cookies=await getSession().cookies.get({url:'https://www.bilibili.com/',name:'bili_jct'});
    const csrf=cookies[0]?.value;if(!csrf)throw new Error('登录状态已失效，请重新登录。');
    const r=await getSession().fetch('https://api.bilibili.com'+endpoint,{method:'POST',headers:{Referer:'https://www.bilibili.com/','Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({...values,csrf}).toString(),signal:AbortSignal.timeout(18000)});
    if(!r.ok)throw new Error('操作结果暂时无法确认，请刷新状态后再试。');
    const j=await r.json();if(j.code!==0)throw new Error(j.code===-101?'登录已失效，请重新登录。':String(j.message||'操作未成功，请稍后重试。').slice(0,180));return j.data||j.result||{};
  }
  async function folders(bvid){
    const a=await identity(),v=await api('/x/web-interface/view?bvid='+bvid);
    const f=await api(`/x/v3/fav/folder/created/list-all?up_mid=${a.mid}&rid=${v.aid}&type=2`);
    return {aid:v.aid,folders:(f.list||[]).map(x=>({id:positive(x.id),title:String(x.title||''),selected:!!x.fav_state,count:Number(x.media_count)||0}))};
  }
  async function relation(bvid){const a=await account();if(!a.loggedIn)return {loggedIn:false,like:false,coin:0,favorite:false,attention:false};return {loggedIn:true,...await api('/x/web-interface/archive/relation?bvid='+bvid)};}
  return async(method,data)=>{
    const id=videoId(data.bvid),seasonId=positive(data.seasonId);
    if(method==='show-follow'){
      if(!seasonId)throw new Error('无效的番剧编号。');
    }else if(!id)throw new Error('无效的视频编号。');
    if(method==='video-state')return relation(id);
    if(method==='video-folders')return folders(id);
    await identity();
    const key=method+':'+(id||seasonId);if(pending.has(key))throw new Error('操作正在处理中，请稍候。');pending.add(key);
    try{
      if(method==='show-follow'){await post('/pgc/web/follow/'+(data.follow?'add':'del'),{season_id:seasonId});return {followed:!!data.follow};}
      if(method==='like-video')await post('/x/web-interface/archive/like',{bvid:id,like:data.like?1:2});
      else if(method==='coin-video'){
        const v=await api('/x/web-interface/view?bvid='+id),state=await relation(id),max=Number(v.copyright)===1?2:1,n=Number(data.count);
        if(![1,2].includes(n)||n+Number(state.coin||0)>max)throw new Error('这个视频可投的硬币数量不足，请刷新投币状态。');
        await post('/x/web-interface/coin/add',{bvid:id,multiply:n,select_like:data.alsoLike?1:0});
      }else if(method==='favorite-video'){
        const f=await folders(id),selected=new Set((Array.isArray(data.folders)?data.folders:[]).map(positive));
        if([...selected].some(n=>!f.folders.some(x=>x.id===n)))throw new Error('收藏夹不存在，请重新选择。');
        const add=f.folders.filter(x=>selected.has(x.id)&&!x.selected).map(x=>x.id),del=f.folders.filter(x=>!selected.has(x.id)&&x.selected).map(x=>x.id);
        if(add.length||del.length)await post('/x/v3/fav/resource/deal',{rid:f.aid,type:2,add_media_ids:add.join(','),del_media_ids:del.join(',')});
      }else if(method==='follow-author'){
        const v=await api('/x/web-interface/view?bvid='+id);if(!positive(v.owner?.mid))throw new Error('没有找到这个 UP 主。');
        await post('/x/relation/modify',{fid:v.owner.mid,act:data.follow?1:2,re_src:11});
      }else if(method!=='like-video' && method!=='coin-video')throw new Error('不支持这个操作。');
      return {success:true,state:await relation(id).catch(()=>null)};
    }finally{pending.delete(key);}
  };
}
module.exports={createSocial};
