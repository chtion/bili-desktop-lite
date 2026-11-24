'use strict';
const {imageURL,plainText}=require('./navigation');
const roomId=value=>{
  const id=String(value??'');
  return /^\d{1,16}$/.test(id)&&Number(id)>0?id:'';
};

function liveURL(id) {
  if(id==='')return 'https://live.bilibili.com/';
  if(typeof id!=='string'||!roomId(id))throw new Error('无法识别直播间。');
  return 'https://live.bilibili.com/blanc/'+id;
}

async function liveJSON(session,endpoint) {
  const response=await session.fetch('https://api.live.bilibili.com'+endpoint,{
    credentials:'include',cache:'no-store',redirect:'error',headers:{Referer:'https://live.bilibili.com/'},
    signal:AbortSignal.timeout(15000)
  });
  if(!response.ok)throw new Error('直播列表暂时无法加载，请稍后刷新。');
  return response.json();
}
const list=value=>Array.isArray(value)?value:[];
function normalizeRooms(entries,{followed=false}={}) {
  const rooms=new Map();
  for(const raw of entries){
    if(!raw||raw.is_ad||followed&&raw.live_status!=null&&Number(raw.live_status)!==1)continue;
    const id=roomId(raw.room_id)||roomId(raw.roomid),author=plainText(raw.uname||raw.nickname);
    const title=plainText(raw.title||raw.roomname)||author;
    if(!id||!title||rooms.has(id))continue;
    const online=Number(raw.online);
    rooms.set(id,{id,title,author,avatar:imageURL(raw.face),
      cover:imageURL(raw.cover)||imageURL(raw.cover_from_user)||imageURL(raw.room_cover)||imageURL(raw.keyframe),
      area:plainText(raw.area_v2_parent_name||raw.area_v2_name||raw.area_name),online:online>0&&Number.isFinite(online)?online:null});
  }
  return [...rooms.values()];
}

async function liveDirectory(session) {
  const {code,data}=await liveJSON(session,'/xlive/web-interface/v1/index/getList?platform=web');
  if(code!==0||!data)throw new Error('B 站直播目录暂时不可用，请稍后刷新。');
  return normalizeRooms([...list(data.recommend_room_list),...list(data.room_list).flatMap(section=>list(section?.list))]);
}
async function followedLive(session) {
  const {code,data}=await liveJSON(session,'/xlive/web-ucenter/v1/xfetter/GetWebList?hit_ab=true');
  if(code===-101)return {needLogin:true,rooms:[]};
  if(code!==0||!data)throw new Error('B 站暂时无法读取关注直播，请稍后刷新。');
  return {needLogin:false,rooms:normalizeRooms([...list(data.rooms),...list(data.list)],{followed:true})};
}

module.exports={liveDirectory,followedLive,liveURL};
