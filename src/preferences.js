'use strict';
const fs = require('node:fs');
const path = require('node:path');
const defaults = Object.freeze({ webFullscreen: false, rightPanel: true, feedAutoNext: true, detailAutoNext: true, historySync: true, bossPause: true, bossKey: 'Control+Alt+B', pinKey: 'Control+Alt+P' });
const {normalize:accelerator,isLocal:isLocalShortcut}=require('./shortcut-keys');
function normalize(input, base=defaults) {
  const result={...base};
  for (const key of ['webFullscreen','rightPanel','feedAutoNext','detailAutoNext','bossPause','historySync']) if(Object.hasOwn(input,key)) {
    if(typeof input[key]!=='boolean')throw new Error('设置值无效。');result[key]=input[key];
  }
  for(const key of ['bossKey','pinKey']) if(Object.hasOwn(input,key))result[key]=accelerator(input[key]);
  if(result.bossKey && result.bossKey===result.pinKey)throw new Error('老板键和置顶快捷键不能相同。');
  return result;
}
function createPreferences(directory, shortcuts, callbacks) {
  const filename=path.join(directory,'preferences.json');
  let current={...defaults}, issues=[], suspended=false;
  const registered=new Set();
  try {current=normalize(JSON.parse(fs.readFileSync(filename,'utf8')));}catch{}
  const bind=key=>shortcuts.register(key,()=>{
    if(suspended)return;
    if(current.bossKey===key)callbacks.boss();else if(current.pinKey===key)callbacks.pin();
  });
  function resume() {
    suspended=false;issues=[];
    for(const key of [current.bossKey,current.pinKey].filter(key=>key&&!isLocalShortcut(key))) if(!registered.has(key)){
      if(bind(key))registered.add(key);else issues.push(`${key} 已被其他程序占用，请修改快捷键。`);
    }
  }
  function suspend(){suspended=true;for(const key of registered)shortcuts.unregister(key);registered.clear();}
  function save(input) {
    const next=normalize(input,current), wanted=new Set([next.bossKey,next.pinKey].filter(key=>key&&!isLocalShortcut(key))), added=[];
    if(suspended)throw new Error('请先结束快捷键录制，再保存。');
    try {
      for(const key of wanted)if(!registered.has(key)){
        if(!bind(key))throw new Error(`${key} 已被其他程序占用，设置未更改。`);
        added.push(key);
      }
      fs.mkdirSync(directory,{recursive:true});
      fs.writeFileSync(filename+'.tmp',JSON.stringify(next,null,2),'utf8');
      fs.renameSync(filename+'.tmp',filename);
    }catch(e){for(const key of added)shortcuts.unregister(key);throw e;}
    for(const key of registered)if(!wanted.has(key))shortcuts.unregister(key);
    registered.clear();for(const key of wanted)registered.add(key);
    current=next;issues=[];return get();
  }
  function get(){return {values:{...current},shortcutErrors:[...issues]};}
  resume();
  return {get,save,suspend,resume,dispose:suspend};
}
module.exports={defaults,accelerator,normalize,createPreferences};
