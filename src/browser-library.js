'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {randomUUID}=require('node:crypto');

const historyLimit=100;
const titleFor=(title,url)=>String(title||'').trim().slice(0,160)||new URL(url).hostname;
function createBrowserLibrary({directory,downloadsDirectory,session,ownsContents,send,reveal,webURL}) {
  const filename=path.join(directory,'browser-library.json');
  const items=new Map();
  let bookmarks=[],downloads=[],timer;
  try {
    const saved=JSON.parse(fs.readFileSync(filename,'utf8'));
    if(Array.isArray(saved.bookmarks))bookmarks=saved.bookmarks.filter(item=>item?.id&&webURL(item.url));
    if(Array.isArray(saved.downloads))downloads=saved.downloads.slice(0,historyLimit).map(item=>
      ['progressing','paused','interrupted'].includes(item.state)?{...item,state:'interrupted',canResume:false}:item);
  }catch{}

  function save(nextBookmarks=bookmarks) {
    fs.mkdirSync(directory,{recursive:true});
    fs.writeFileSync(filename+'.tmp',JSON.stringify({bookmarks:nextBookmarks,downloads:downloads.slice(0,historyLimit)}),'utf8');
    fs.renameSync(filename+'.tmp',filename);
  }
  function saveDownloads() {
    try { save(); }catch { send('browser-library-error','下载记录暂时无法保存。'); }
  }
  const snapshot=()=>downloads.map(({file,...item})=>({...item,hasFile:Boolean(file)}));
  function notify(now=false) {
    if(now){clearTimeout(timer);timer=null;send('browser-downloads',snapshot());}
    else timer??=setTimeout(()=>notify(true),180);
  }

  function onDownload(event,item,contents) {
    if(!ownsContents(contents)){event.preventDefault();return;}
    const name=path.basename(item.getFilename());
    const label=name&&name!=='.'&&name!=='..'?name:'下载文件';
    item.setSaveDialogOptions({title:'保存下载文件',defaultPath:path.join(downloadsDirectory,label)});
    const record={id:randomUUID(),name:label,state:'progressing',received:0,total:item.getTotalBytes(),canResume:false,file:''};
    downloads.unshift(record);
    items.set(record.id,item);
    const refresh=state=>{
      record.state=item.isPaused()?'paused':state;
      record.received=item.getReceivedBytes();
      record.total=item.getTotalBytes();
      record.canResume=item.canResume();
    };
    item.on('updated',(_event,state)=>{refresh(state);notify();});
    item.once('done',(_event,state)=>{
      refresh(state);
      record.state=state;record.canResume=false;
      if(state==='completed'){
        record.file=item.getSavePath();
        record.name=path.basename(record.file)||label;
      }
      items.delete(record.id);
      downloads=downloads.filter((entry,index)=>index<historyLimit||items.has(entry.id));
      saveDownloads();notify(true);
    });
    saveDownloads();notify(true);
  }
  session.on('will-download',onDownload);

  function bookmark(action,id,value,tab) {
    const found=bookmarks.find(entry=>entry.id===id);
    let next=bookmarks;
    if(action==='bookmark'&&webURL(tab?.url)){
      const saved=bookmarks.find(entry=>entry.url===tab.url);
      next=saved?bookmarks.filter(entry=>entry!==saved):[{id:randomUUID(),url:tab.url,title:titleFor(tab.title,tab.url)},...bookmarks];
    }
    if(action==='open-bookmark')return found?.url;
    if(action==='remove-bookmark'&&found)next=bookmarks.filter(entry=>entry!==found);
    if(action==='rename-bookmark'&&found)next=bookmarks.map(entry=>entry===found?{...entry,title:titleFor(value,entry.url)}:entry);
    if(next!==bookmarks){save(next);bookmarks=next;}
  }

  function download(action,id) {
    const record=downloads.find(entry=>entry.id===id);
    const item=items.get(id);
    if(action==='pause'&&item&&record.state==='progressing'){item.pause();record.state='paused';record.canResume=item.canResume();}
    if(action==='resume'&&item?.canResume()){item.resume();record.state='progressing';}
    if(action==='cancel'&&item)item.cancel();
    if(action==='reveal'&&record?.state==='completed'&&record.file){
      if(!fs.existsSync(record.file))throw new Error('文件已移动或删除。');
      reveal(record.file);
    }
    if(action==='remove'&&record&&!item){downloads=downloads.filter(entry=>entry!==record);saveDownloads();}
    notify(true);
  }

  function dispose() {
    session.off('will-download',onDownload);
    clearTimeout(timer);
  }
  return {bookmark,bookmarks:()=>bookmarks,download,downloads:snapshot,dispose};
}
module.exports={createBrowserLibrary};
