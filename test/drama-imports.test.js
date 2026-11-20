'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {createDramaImports,parseCatalog,publicURL}=require('../src/drama-imports');

test('JSON groups episodes, while M3U retains the title, group and relative URLs',()=>{
  const reference='https://media.example.org/folder/list.m3u';
  const result=parseCatalog('#EXTM3U\n#EXTINF:-1 group-title="漫剧" tvg-logo="cover.jpg",测试, 上篇\ntest.m3u8', 'source','来自订阅',reference);
  const item=result.items[0];
  assert.equal(item.title,'测试, 上篇');
  assert.equal(item.cover,'https://media.example.org/folder/cover.jpg');
  assert.equal(item.episodes[0].url,'https://media.example.org/folder/test.m3u8');
  assert.equal(item.episodes[0].format,'hls');
  const json=parseCatalog(JSON.stringify({name:'样本',items:[{title:'剧名',episodes:[{url:'first.mp4'},{url:'second.mp4'}]}]}),
    'source','来自订阅',reference);
  assert.equal(json.name,'样本');
  assert.equal(json.items[0].count,2);
  for(const address of ['file:///C:/test.mp4','https://127.0.0.1/test.mp4','https://a.local/test.mp4','https://user:pass@media.example.org/test.mp4']){
    assert.equal(publicURL(address),'');
  }
});

test('subscription refresh persists the library, hides stream URLs and rewrites clear HLS',async()=>{
  const dir=await fs.mkdtemp(path.resolve('.cache','sources-unit-'));
  const calls=[];
  let name='第一部';
  const read=async(href,options)=>{
    calls.push({href,options});
    if(href.endsWith('list.json')){
      return {href,response:Response.json({name:'站源测试',items:[{id:'show',title:name,url:'first.m3u8'}]})};
    }
    if(href.endsWith('.m3u8'))return {href,response:new Response('#EXTM3U\n#EXTINF:5,\nsegment.ts\n#EXT-X-ENDLIST')};
    return {href,response:new Response('segment',{headers:{'Content-Type':'video/mp2t'}})};
  };
  const store=createDramaImports(dir,read);
  const [source]=await store.command('subscribe','https://media.example.org/list.json');
  assert.equal(source.name,'站源测试');
  const {items}=await store.browse('catalog',{sourceId:source.id});
  assert.equal(items[0].title,'第一部');
  const base={sourceId:source.id,seriesId:items[0].id};
  const detail=await store.browse('detail',base);
  assert.equal(detail.items[0].url,undefined);
  const media=await store.browse('playback',{...base,episodeId:detail.items[0].id});
  assert.equal(media.type,'hls');
  const manifest=await store.handleMedia(new Request(media.url));
  const segment=(await manifest.text()).match(/bili-app:[^\s]+\.bin/)?.[0];
  assert.ok(segment);
  assert.equal(await (await store.handleMedia(new Request(segment))).text(),'segment');
  assert.equal(calls.at(-1).href,'https://media.example.org/segment.ts');
  store.release(media.token);
  assert.equal((await store.handleMedia(new Request(segment))).status,404);
  name='新名称';
  await store.command('refresh',source.id);
  const restarted=createDramaImports(dir,read);
  const updated=await restarted.browse('catalog',{sourceId:source.id});
  assert.equal(updated.items[0].title,'新名称');
  assert.equal(updated.items[0].id,items[0].id);
  assert.deepEqual(await restarted.command('remove',source.id),[]);
});
