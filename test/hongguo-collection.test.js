'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {collectPages}=require('../src/hongguo-collection');

const title=id=>({id:String(id),title:'剧目 '+id});
const begin={items:[],cursor:''};
const run=(fetchPage,options={})=>collectPages({
  initial:begin,limit:24,fetchPage,checkpoint:async()=>{},stopped:()=>false,wait:async()=>{},...options
});

test('a batch checkpoints each page and continues from the saved cursor after a pause',async()=>{
  const saved=[];
  const pages={
    start:{items:[title(1),title(2)],cursor:'page-2',more:true},
    'page-2':{items:[title(2),title(3)],cursor:'page-3',more:true},
    'page-3':{items:[title(4)],cursor:'',more:false}
  };
  const first=await run(cursor=>pages[cursor||'start'],{
    stopped:()=>saved.length===1,checkpoint:async state=>saved.push(state)
  });
  assert.equal(first.reason,'paused');
  assert.equal(saved[0].cursor,'page-2');
  const restarted=await run(cursor=>pages[cursor],{initial:saved[0]});
  assert.equal(restarted.reason,'complete');
  assert.equal(restarted.state.end,'complete');
  assert.deepEqual(restarted.state.items.map(item=>item.id),['1','2','3','4']);
});

test('larger batches retain more than one thousand titles and do not confuse duplicate pages with a complete directory',async()=>{
  let index=0;
  const largeCursor='x'.repeat(80000);
  const first=await run(()=>{
    const items=Array.from({length:50},(_,item)=>title(index*50+item));
    index++;
    return {items,cursor:largeCursor+index,more:true};
  });
  assert.equal(first.pages,24);
  assert.equal(first.state.items.length,1200);
  assert.equal(first.state.cursor,largeCursor+'24');
  assert.equal(first.state.end,'');
  const repeated=await run(()=>({items:[title(0)],cursor:first.state.cursor,more:true}),{initial:first.state});
  assert.equal(repeated.reason,'cursor');
  const limited=await run(()=>({items:[title(0)],cursor:'',more:true}),{initial:first.state});
  assert.equal(limited.reason,'cursor');
  assert.equal(limited.state.cursor,first.state.cursor);
});
