'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {mediaURL,createMediaService}=require('../src/media');
test('media proxy only accepts HTTPS Bilibili CDN hosts',()=>{
  for(const url of ['http://cdn.bilivideo.com/v','https://bilivideo.com.evil.test/v','https://127.0.0.1/v','https://user@cdn.bilivideo.com/v','https://cdn.bilivideo.com:8080/v','file:///C:/private'])assert.equal(mediaURL(url),'');
  assert.equal(mediaURL('https://upos.bilivideo.com/v'),'https://upos.bilivideo.com/v');
});
test('DASH manifest keeps upstream URLs private, preserves byte ranges, and expires on release',async()=>{
  const calls=[];
  const media=createMediaService(()=>({fetch:async(url,options)=>{calls.push({url,options});return new Response(new Uint8Array([1,2]),{status:206,headers:{'content-range':'bytes 0-1/500','content-type':'video/mp4'}});}}));
  const track={id:32,bandwidth:9000,codecs:'avc1.64001F',width:852,height:480,baseUrl:'https://cdn.bilivideo.com/v?secret=fixture',SegmentBase:{Initialization:'0-99',indexRange:'100-199'}};
  const source=media.prepare({dash:{duration:10,video:[track],audio:[]}});
  const manifest=await(await media.handle(new Request(source.url))).text();
  assert.ok(manifest.includes('indexRange="100-199"'));assert.ok(!manifest.includes('secret'));assert.ok(!manifest.includes('cdn.bilivideo.com'));
  const stream=manifest.match(/<BaseURL>(.*?)<\/BaseURL>/)[1];
  const response=await media.handle(new Request(stream,{headers:{Range:'bytes=0-1'}}));
  assert.equal(response.status,206);assert.equal(response.headers.get('content-range'),'bytes 0-1/500');assert.equal(calls[0].options.headers.Range,'bytes=0-1');assert.equal(calls[0].options.headers.Referer,'https://www.bilibili.com/');
  assert.equal((await media.handle(new Request(stream,{headers:{Range:'bytes=0-1,4-9'}}))).status,416);
  media.release(source.token);assert.equal((await media.handle(new Request(source.url))).status,404);assert.equal((await media.handle(new Request(stream))).status,404);
});
