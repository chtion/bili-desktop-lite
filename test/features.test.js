'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {sign}=require('../src/wbi'),{subtitleURL,normalizeCues,createSubtitles}=require('../src/subtitles'),{createRecommendations}=require('../src/recommendations'),{createSocial}=require('../src/social');
test('WBI signature matches the documented deterministic vector',()=>{
  assert.equal(sign({foo:'114',bar:'514',zab:1919810},'7cd084941338484aae1ad9425b84077c4932caff0ff746eab6f01bf08b70ac45',1702204169),'bar=514&foo=114&wts=1702204169&zab=1919810&w_rid=8f6f2b5b3d485fe1886cec6a0be8c5d4');
});
test('subtitle destinations, cue contents and video identity are validated',async()=>{
  assert.equal(subtitleURL('https://hdslb.com.evil.test/sub.json'),'');assert.equal(subtitleURL('file:///secret'),'');assert.equal(subtitleURL('//aisubtitle.hdslb.com/a.json'),'https://aisubtitle.hdslb.com/a.json');
  assert.deepEqual(normalizeCues([{from:2,to:3,content:'测试'},{from:-1,to:1,content:'invalid'},{from:4,to:2,content:'invalid'}]),[{from:2,to:3,text:'测试'}]);
  const s=createSubtitles(async()=>({cid:999,aid:1}),()=>{});await assert.rejects(()=>s.list({cid:2,aid:1}),/不匹配/);
});
test('recommendations distinguish account, guest and explicit popular fallback',async()=>{
  const video={goto:'av',bvid:'BV1R54y1n7wh',title:'recommendation'};let fail=false,mid=42;
  const f=createRecommendations(async()=>({list:[video],no_more:true}),async()=>{if(fail)throw Error('offline');return {item:[video,{...video,goto:'ad'}],mid};},async()=>({loggedIn:true,mid:42}));
  assert.equal((await f(1)).source,'account');mid=0;assert.equal((await f(2)).source,'guest');fail=true;const d=await f(3);assert.equal(d.source,'popular');assert.match(d.note,/暂时展示热门/);assert.equal(d.items.length,1);
});
test('coin action is authenticated, validates allowance and never posts on invalid input',async()=>{
  let posts=0,login=false;const api=async p=>p.includes('/view')?{copyright:1}:{coin:1};
  const social=createSocial(api,async()=>({loggedIn:login}),()=>({cookies:{get:async()=>[{value:'test-csrf'}]},fetch:async()=>{posts++;return Response.json({code:0,data:{}});}}));
  await assert.rejects(()=>social('coin-video',{bvid:'BV1R54y1n7wh',count:1}),/登录/);login=true;
  await assert.rejects(()=>social('coin-video',{bvid:'BV1R54y1n7wh',count:2}),/数量不足/);assert.equal(posts,0);
  await social('coin-video',{bvid:'BV1R54y1n7wh',count:1});assert.equal(posts,1);
});
