'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {liveDirectory,followedLive,liveURL}=require('../src/live');

test('live directory keeps recommended rooms, deduplicates sections and validates cover and room URLs',async()=>{
  const first={roomid:123,title:'<em>主播 &amp; 访客</em>',cover:'http://i0.hdslb.com/test.png',area_v2_parent_name:'游戏'};
  const rooms=await liveDirectory({fetch:async()=>Response.json({code:0,data:{
    recommend_room_list:[first],
    room_list:[{list:[{...first,title:'重复直播间'},{roomid:456,title:'直播',cover:'https://other.test/'},
      undefined,{roomid:'https://other.test/',title:'无效房间'},{roomid:12,title:'广告',is_ad:true}]}]
  }})});
  assert.deepEqual(rooms.map(room=>[room.id,room.title,room.cover,room.area]),[
    ['123','主播 & 访客','https://i0.hdslb.com/test.png','游戏'],['456','直播','','']
  ]);
  assert.equal(liveURL('123'),'https://live.bilibili.com/blanc/123');
  assert.throws(()=>liveURL('123/../456'),/无法识别/);
});

test('followed live rooms use the signed-in session and only include active streams',async()=>{
  const entry={room_id:800,roomid:0,title:'正在播',uname:'主播',live_status:1,online:0,
    face:'https://i0.hdslb.com/avatar.png',cover_from_user:'https://i0.hdslb.com/live.png'};
  const result=await followedLive({fetch:async(url,options)=>{
    assert.equal(new URL(url).searchParams.get('hit_ab'),'true');
    assert.equal(options.credentials,'include');
    assert.equal(options.redirect,'error');
    return Response.json({code:0,data:{rooms:[entry,{...entry,room_id:90,live_status:0},
      {...entry,room_id:91,live_status:2}],list:[entry]}});
  }});
  assert.equal(result.needLogin,false);
  assert.deepEqual(result.rooms,[{id:'800',title:'正在播',author:'主播',avatar:entry.face,cover:entry.cover_from_user,area:'',online:null}]);
  assert.deepEqual(await followedLive({fetch:async()=>Response.json({code:-101})}),{needLogin:true,rooms:[]});
  await assert.rejects(followedLive({fetch:async()=>Response.json({code:-352})}),/无法读取关注直播/);
});
