'use strict';
const ShortcutKeys=(()=>{
  const symbols={Backquote:'`',Minus:'-',Equal:'=',BracketLeft:'[',BracketRight:']',Backslash:'\\',
    Semicolon:';',Quote:"'",Comma:',',Period:'.',Slash:'/'};
  const baseKeys=new Set(Object.values(symbols));
  const modifiers=['Control','Alt','Shift'];
  const isOrdinary=key=>/^[A-Z0-9]$/.test(key)||baseKeys.has(key);
  const isFunction=key=>/^F(?:[1-9]|1\d|2[0-4])$/.test(key);

  function normalize(value) {
    if(value==='')return '';
    if(typeof value!=='string'||value.length>60)throw new Error('快捷键格式无效。');
    const parts=value.split('+').map(part=>part==='Ctrl'?'Control':part);
    const key=parts.pop().toUpperCase();
    if((!isOrdinary(key)&&!isFunction(key))||new Set(parts).size!==parts.length||parts.some(part=>!modifiers.includes(part)))
      throw new Error('请使用字母、数字、常用符号或 F1–F24，可搭配 Ctrl、Alt、Shift。');
    const result=[...modifiers.filter(modifier=>parts.includes(modifier)),key].join('+');
    if(['F5','F11','Control+K','Control+L','Alt+F4'].includes(result))throw new Error('这个快捷键已用于刷新、搜索、全屏或关闭窗口，请换一个。');
    return result;
  }

  function fromEvent(event) {
    if(event.metaKey||event.isComposing)return '';
    const key=Object.hasOwn(symbols,event.code)?symbols[event.code]:event.code?.match(/^(?:Key([A-Z])|Digit([0-9])|(F(?:[1-9]|1\d|2[0-4])))$/)?.slice(1).find(Boolean);
    return key?[event.ctrlKey?'Control':'',event.altKey?'Alt':'',event.shiftKey?'Shift':'',key].filter(Boolean).join('+'):'';
  }

  function isLocal(shortcut) {
    const parts=shortcut.split('+');
    const key=parts.pop();
    return isOrdinary(key)&&parts.every(part=>part==='Shift');
  }
  return {normalize,fromEvent,isLocal};
})();
if(typeof module!=='undefined')module.exports=ShortcutKeys;
