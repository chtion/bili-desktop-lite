'use strict';
const fs=require('node:fs/promises');
const {createReadStream,createWriteStream}=require('node:fs');
const path=require('node:path');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {Readable,Transform}=require('node:stream');
const {pipeline}=require('node:stream/promises');
const run=promisify(execFile);
const maxInput=64*1024*1024;

async function findFfmpeg() {
  const name=process.platform==='win32'?'ffmpeg.exe':'ffmpeg';
  if(process.resourcesPath){
    const bundled=path.join(process.resourcesPath,'ffmpeg',name);
    if((await fs.stat(bundled).catch(()=>null))?.isFile())return bundled;
  }
  for(const folder of (process.env.PATH||'').split(path.delimiter).map(entry=>entry.replace(/^"|"$/g,''))){
    if(!path.isAbsolute(folder))continue;
    const file=path.join(folder,name);
    if((await fs.stat(file).catch(()=>null))?.isFile())return file;
  }
  return '';
}

function createProtectedMedia({directory,executable,key,urls,network}) {
  const controller=new AbortController();
  let task,folder,input,output;
  async function cleanup() {
    if(!folder)return;
    for(const file of [input,output])await fs.unlink(file).catch(()=>{});
    await fs.rmdir(folder).catch(()=>{});
  }
  async function fetchInput(signal) {
    for(const url of urls){
      signal.throwIfAborted();
      try {
        const response=await network.fetch(url,{credentials:'omit',redirect:'error',signal});
        const type=response.headers.get('content-type');
        if(response.status!==200||!response.body||Number(response.headers.get('content-length'))>maxInput||
          (type&&!/^(?:video\/mp4|application\/octet-stream)(?:;|$)/i.test(type))){
          await response.body?.cancel();continue;
        }
        let size=0;
        const bound=new Transform({transform(chunk,_encoding,callback){
          size+=chunk.length;
          if(size>maxInput)callback(new Error('Source exceeds the media size limit.'));
          else callback(null,chunk);
        }});
        await pipeline(Readable.fromWeb(response.body),bound,createWriteStream(input),{signal});
        return;
      }catch{signal.throwIfAborted();}
    }
    throw new Error('红果视频连接失败。');
  }
  async function prepare() {
    const signal=AbortSignal.any([controller.signal,AbortSignal.timeout(90000)]);
    await fs.mkdir(directory,{recursive:true});
    folder=await fs.mkdtemp(path.join(directory,'episode-'));
    input=path.join(folder,'source.mp4');output=path.join(folder,'playback.mp4');
    try{
      await fetchInput(signal);
      await run(executable,['-nostdin','-v','error','-xerror','-protocol_whitelist','file','-f','mov','-decryption_key',key,'-i',input,
        '-map','0:v:0','-map','0:a:0?','-c:v','libx264','-preset','ultrafast','-crf','22','-pix_fmt','yuv420p','-threads','4',
        '-c:a','aac','-b:a','112k','-movflags','+faststart',output],{signal,windowsHide:true,maxBuffer:65536});
      await fs.unlink(input);
      return (await fs.stat(output)).size;
    }catch{
      await cleanup();
      throw new Error('红果受保护视频暂时无法解码。');
    }
  }
  async function handle(request,range) {
    if(controller.signal.aborted)return new Response(null,{status:404});
    try{
      const size=await (task??=prepare());
      if(controller.signal.aborted)return new Response(null,{status:404});
      const [,from,to]=range?.match(/^bytes=(\d+)-(\d*)$/)||[];
      const start=Number(from||0),end=to?Math.min(Number(to),size-1):size-1;
      if(start>end||!Number.isSafeInteger(start))return new Response(null,{status:416,headers:{'Content-Range':`bytes */${size}`}});
      const headers={'Content-Type':'video/mp4','Accept-Ranges':'bytes','Content-Length':String(end-start+1),'Cache-Control':'no-store'};
      if(range)headers['Content-Range']=`bytes ${start}-${end}/${size}`;
      const signal=AbortSignal.any([controller.signal,request.signal]);
      const stream=createReadStream(output,{start,end,signal});
      return new Response(Readable.toWeb(stream),{status:range?206:200,headers});
    }catch{return new Response(null,{status:502});}
  }
  async function dispose() {
    controller.abort();
    await task?.catch(()=>{});
    await cleanup();
  }
  return {handle,dispose};
}
module.exports={createProtectedMedia,findFfmpeg};
