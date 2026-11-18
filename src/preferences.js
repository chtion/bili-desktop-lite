'use strict';
const fs = require('node:fs');
const path = require('node:path');
const defaults = Object.freeze({ webFullscreen: false, rightPanel: true, bossPause: true, bossKey: 'Control+Alt+B', pinKey: 'Control+Alt+P' });
function accelerator(value) {
  if (value === '') return '';
  if (typeof value !== 'string' || value.length > 60) throw new Error('快捷键格式无效。');
  const parts=value.split('+').map(p=>p==='Ctrl'?'Control':p);
  const key=parts.pop()?.toUpperCase(), modifiers=['Control','Alt','Shift'];
  if (!/^(?:[A-Z0-9]|F(?:[1-9]|1\d|2[0-4]))$/.test(key) || new Set(parts).size!==parts.length || parts.some(p=>!modifiers.includes(p))) throw new Error('请使用 Ctrl、Alt、Shift 配合字母、数字，或 F1–F24。');
  if (!parts.includes('Control') && !parts.includes('Alt') && !/^F\d+$/.test(key)) throw new Error('字母和数字快捷键需要搭配 Ctrl 或 Alt。');
  const result=[...modifiers.filter(m=>parts.includes(m)),key].join('+');
  if (['F5','F11','Control+K','Control+L','Alt+F4'].includes(result)) throw new Error('这个快捷键已用于刷新、搜索、全屏或关闭窗口，请换一个。');
  return result;
}
function normalize(input, base=defaults) {
  const result={...base};
  for (const key of ['webFullscreen','rightPanel','bossPause']) if(Object.hasOwn(input,key)) {
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
    for(const key of [current.bossKey,current.pinKey].filter(Boolean)) if(!registered.has(key)){
      if(bind(key))registered.add(key);else issues.push(`${key} 已被其他程序占用，请修改快捷键。`);
    }
  }
  function suspend(){suspended=true;for(const key of registered)shortcuts.unregister(key);registered.clear();}
  function save(input) {
    const next=normalize(input,current), wanted=new Set([next.bossKey,next.pinKey].filter(Boolean)), added=[];
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
