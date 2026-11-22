'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createHongguo,officialURL}=require('../src/hongguo');

const seriesId='7705824595416190014', first='7705826165692304409', second='7705826348597529625';

function fixture(resolvePlayback, fetch=async()=>{throw new Error('Unexpected network request');}) {
  const api={
    shortFilter:async()=>({items:[{id:seriesId,title:'测试剧集',cover_url:'https://p3-reading-sign.fqnovelpic.com/cover.jpg',episode_count:2}]}),
    getSeries:async()=>({id:seriesId,title:'测试剧集',description:'两集测试剧情'}),
    listEpisodes:async()=>({items:[{id:first,number:1,playable:true},{id:second,number:2,playable:false}]}),
    resolvePlayback
  };
  return createHongguo({directory:'.',network:{fetch},loadSDK:async()=>({createClient:settings=>{
    assert.equal(settings.deviceResets,0);
    assert.equal(settings.retryAttempts,1);
    return api;
  }})});
}

test('Hongguo retains exact IDs and reports permission limits without retrying or revealing credentials',async()=>{
  let calls=0;
  const source=fixture(async()=>{
    calls++;
    throw Object.assign(new Error('Private response details'),{code:'ANONYMOUS_LIMITED'});
  });
  const list=await source.request('catalog');
  assert.equal(list.items[0].id,seriesId);
  const detail=await source.request('detail',{seriesId});
  assert.deepEqual(detail.items.map(({id,playable})=>[id,playable]),[[first,true],[second,false]]);
  const restricted=await source.request('playback',{seriesId,episodeId:second});
  assert.match(restricted.message,/官方观看/);
  assert.equal(restricted.retryable,false);
  assert.equal(calls,0);
  const limited=await source.request('playback',{seriesId,episodeId:first});
  assert.match(limited.message,/未向当前客户端开放/);
  assert.equal(limited.retryable,false);
  assert.equal(calls,1);
  assert.match(officialURL(seriesId,first),new RegExp(first+'$'));
  assert.equal(officialURL(seriesId,first,1),`https://hongguoduanju.com/player/${seriesId}`);
  assert.equal(officialURL(seriesId,second,2),`https://hongguoduanju.com/player/${seriesId}/${second}`);
  assert.throws(()=>officialURL('https://example.com'));
});

test('Hongguo reports protected-only streams before starting the player',async()=>{
  const source=fixture(async()=>({playback:{protected:true,streams:[
    {url:'https://v95-aw-reading-video.qznovelvod.com/sample.mp4',codec:'bytevc1',protected:true}
  ]}}));
  await source.request('detail',{seriesId});
  const result=await source.request('playback',{seriesId,episodeId:first});
  assert.match(result.message,/受保护片源/);
  assert.equal(result.retryable,false);
  assert.equal(result.url,undefined);
  assert.equal(result.token,undefined);
});

test('Hongguo serves an allowed clear MP4 via a private token and forwards a single range',async()=>{
  const requests=[];
  const source=fixture(async()=>({
    playback:{protected:true,streams:[
      {url:'https://v1-novel.byte-vod.com/protected.mp4',codec:'h264',protected:true},
      {url:'https://example.net/private.mp4',codec:'h264',protected:false},
      {url:'https://v1-novel.byte-vod.com/clear.mp4',codec:'h264',protected:false}
    ]}
  }),async(url,options)=>{
    requests.push({url,options});
    return new Response('media',{status:206,headers:{'Content-Type':'video/mp4','Content-Range':'bytes 0-4/5'}});
  });
  await source.request('detail',{seriesId});
  const result=await source.request('playback',{seriesId,episodeId:first});
  assert.match(result.url,/^bili-app:\/\/shell\/drama-media\//);
  assert.equal(result.type,'mp4');
  const media=new Request(result.url,{headers:{Range:'bytes=0-'}});
  const response=await source.handleMedia(media);
  assert.equal(response.status,206);
  assert.equal(response.headers.get('content-range'),'bytes 0-4/5');
  assert.equal(requests[0].url,'https://v1-novel.byte-vod.com/clear.mp4');
  assert.equal(requests[0].options.headers.Range,'bytes=0-');
  assert.equal(requests[0].options.credentials,'omit');
  assert.equal(requests[0].options.redirect,'error');
  source.release(result.token);
  assert.equal((await source.handleMedia(media)).status,404);
});
