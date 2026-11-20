'use strict';
const HongguoCollection=(()=>{
  function merge(first,second) {
    return [...new Map([...first,...second].map(item=>[item.id,item])).values()];
  }

  async function collectPages({initial,limit,fetchPage,checkpoint,stopped,wait}) {
    const titles=new Map(initial.items.map(item=>[item.id,item]));
    const visited=new Set(initial.cursor?[initial.cursor]:[]);
    const seenThisRun=new Set();
    let position=initial.cursor||'', stagnant=0;
    let state=initial, pages=0, reason='batch';
    while(pages<limit){
      if(stopped()){reason='paused';break;}
      const page=await fetchPage(position||undefined);
      let newToRun=0;
      for(const item of page.items){
        if(!seenThisRun.has(item.id)){seenThisRun.add(item.id);newToRun++;}
        titles.set(item.id,item);
      }
      stagnant=newToRun?0:stagnant+1;
      pages++;
      const next=page.cursor||'';
      const more=page.more??Boolean(next);
      if(!more)reason='complete';
      else if(!next||visited.has(next))reason='cursor';
      else if(stagnant>=3)reason='stalled';
      if(next&&!visited.has(next)){position=next;visited.add(next);}
      state={items:[...titles.values()],cursor:reason==='complete'?'':position,end:reason==='batch'?'':reason};
      await checkpoint(state,pages);
      if(reason!=='batch')break;
      if(stopped()){reason='paused';break;}
      if(pages<limit)await wait();
    }
    return {state,reason,pages,added:titles.size-initial.items.length};
  }

  let database;
  function open() {
    database??=new Promise((resolve,reject)=>{
      const request=indexedDB.open('bili-lite-drama-catalog',1);
      request.onupgradeneeded=()=>request.result.createObjectStore('library');
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error);
    }).catch(error=>{database=null;throw error;});
    return database;
  }
  async function readLibrary() {
    const db=await open();
    return new Promise((resolve,reject)=>{
      const request=db.transaction('library').objectStore('library').get('hongguo');
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error);
    });
  }
  async function writeLibrary(entry) {
    const db=await open();
    return new Promise((resolve,reject)=>{
      const transaction=db.transaction('library','readwrite');
      transaction.objectStore('library').put(entry,'hongguo');
      transaction.oncomplete=resolve;
      transaction.onabort=()=>reject(transaction.error||new Error('剧库保存已中断。'));
      transaction.onerror=()=>reject(transaction.error);
    });
  }
  return {merge,collectPages,readLibrary,writeLibrary};
})();
if(typeof module!=='undefined')module.exports=HongguoCollection;
