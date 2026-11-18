'use strict';
const fs=require('node:fs/promises');
const {constants,createReadStream,createWriteStream}=require('node:fs');
const path=require('node:path');
const {createHash}=require('node:crypto');
const {Readable,Transform}=require('node:stream');
const {pipeline}=require('node:stream/promises');
const repository='chtion/bili-desktop-lite';
const downloadHosts=new Set(['github.com','release-assets.githubusercontent.com','objects.githubusercontent.com']);
const apiBase=`https://api.github.com/repos/${repository}`;
const versionPattern=/^\d{1,5}\.\d{1,5}\.\d{1,5}$/;
const digestPattern=/^[a-f0-9]{64}$/;
const maxSize=512*1024*1024;

function assetName(version,mode) {
  return `Bili-Desktop-Lite-${version}-${mode==='portable'?'Portable':'Setup'}-x64.exe`;
}
function outsideDevelopmentLine(version,current) {
  return current.startsWith('0.')&&!version.startsWith('0.');
}
const validVersion=version=>typeof version==='string'&&versionPattern.test(version);
function newer(version,current) {
  if(!validVersion(version)||!validVersion(current))return false;
  if(outsideDevelopmentLine(version,current))return false;
  const proposed=version.split('.').map(Number),existing=current.split('.').map(Number);
  for(let i=0;i<3;i++)if(proposed[i]!==existing[i])return proposed[i]>existing[i];
  return false;
}
function validateAsset(version,mode,asset) {
  if(asset?.name!==assetName(version,mode)||!digestPattern.test(asset.sha256||'')||!Number.isSafeInteger(asset.size)||asset.size<=0||asset.size>maxSize)throw new Error('发布包缺少可核验的校验信息。');
  return {name:asset.name,size:asset.size,sha256:asset.sha256};
}
async function verify(file,asset) {
  const stat=await fs.lstat(file);
  if(!stat.isFile()||stat.size!==asset.size)throw new Error('更新文件大小不正确。');
  const digest=createHash('sha256');
  for await(const chunk of createReadStream(file))digest.update(chunk);
  if(digest.digest('hex')!==asset.sha256)throw new Error('更新文件校验失败，请重新获取发布包。');
}

function createUpdates({app,fetch,chooseFolder,portableFile,version=app.getVersion(),onProgress=()=>{},getCredential=async()=>null}) {
  const current=version,mode=portableFile?'portable':'installer';
  let candidate=null,operation=null,checkGeneration=0;
  const summary=(message,offer=null)=>({current,message,offer});
  const apiHeaders=accept=>({'User-Agent':`BiliDesktopLite/${current}`,Accept:accept,'X-GitHub-Api-Version':'2022-11-28'});
  function offerFor(update){return summary(`发现 v${update.version}，更新后会重启。`,{version:update.version,source:update.file?'本地发布文件夹':'GitHub Releases',size:update.size,notes:update.notes||''});}

  async function fromFolder(folder,turn) {
    const root=await fs.realpath(folder);
    const manifestPath=path.join(root,'bili-release.json');
    const stat=await fs.lstat(manifestPath).catch(()=>null);
    if(!stat?.isFile()||stat.size>32768)throw new Error('此文件夹内没有有效的 bili-release.json。');
    const manifest=JSON.parse(await fs.readFile(manifestPath,'utf8'));
    if(!validVersion(manifest.version))throw new Error('发布清单版本无效。');
    if(outsideDevelopmentLine(manifest.version,current))return summary('这个发布使用旧编号。请选择 0.x 开发版的发布文件夹。');
    if(!newer(manifest.version,current))return summary(`文件夹中的版本为 ${manifest.version}，没有比当前更新的版本。`);
    const asset=validateAsset(manifest.version,mode,manifest.assets?.[mode]);
    const file=path.join(root,asset.name);
    await verify(file,asset);
    if(turn!==checkGeneration)return summary('已发起另一次更新检查。');
    candidate={...asset,version:manifest.version,file};
    return offerFor(candidate);
  }

  async function check(local=false) {
    if(operation)throw new Error('更新正在进行。');
    const turn=++checkGeneration;
    candidate=null;
    if(local){const folder=await chooseFolder();return folder?fromFolder(folder,turn):summary('已取消选择。');}
    const headers=apiHeaders('application/vnd.github+json');
    const latest=extra=>fetch(`${apiBase}/releases/latest`,{credentials:'omit',headers:{...headers,...extra},redirect:'error',cache:'no-store',signal:AbortSignal.timeout(15000)});
    let result=await latest(),privateRelease=false;
    if(turn!==checkGeneration)return summary('已发起另一次更新检查。');
    if(result.status===404){
      const token=await getCredential();
      if(!token)return summary('无法读取 GitHub Releases。私有仓库需要本机 Git 登录，也可以从发布文件夹检查。');
      privateRelease=true;
      result=await latest({Authorization:`Bearer ${token}`});
      if(result.status===404||result.status===401)return summary('本机 GitHub 登录无法读取此仓库的发布，请检查账号权限。');
    }
    if(result.status===429||result.status===403&&result.headers.get('x-ratelimit-remaining')==='0')throw new Error('GitHub 暂时限制请求次数，请稍后再试。');
    if(!result.ok)throw new Error(`GitHub 更新检查暂不可用（HTTP ${result.status}）。`);
    const release=await result.json(),tag=String(release.tag_name||''),version=tag.replace(/^v/,'');
    if(turn!==checkGeneration)return summary('已发起另一次更新检查。');
    if(!validVersion(version)||release.draft||release.prerelease)throw new Error('未找到有效的公开发布。');
    if(outsideDevelopmentLine(version,current))return summary('公开发布仍使用旧编号。可以从 0.x 发布文件夹检查。');
    if(!newer(version,current))return summary('当前已经是最新公开版本。');
    const found=(release.assets||[]).find(a=>a.name===assetName(version,mode)&&a.state==='uploaded');
    if(!found)throw new Error('这个版本未发布适用于当前安装方式的 EXE。');
    const asset=validateAsset(version,mode,{name:found.name,size:found.size,sha256:String(found.digest||'').replace(/^sha256:/,'')});
    const url=`https://github.com/${repository}/releases/download/${encodeURIComponent(tag)}/${asset.name}`;
    if(found.browser_download_url!==url)throw new Error('发布包下载地址不匹配。');
    if(privateRelease&&(!Number.isSafeInteger(found.id)||found.id<=0))throw new Error('私有发布缺少有效的下载编号。');
    candidate={...asset,version,url,privateAssetId:privateRelease?found.id:null,notes:typeof release.body==='string'?release.body.trim().slice(0,1600):''};
    return offerFor(candidate);
  }

  function report(task,phase,bytes=0) {
    task.phase=phase;
    onProgress({phase,bytes,total:task.update.size,version:task.update.version});
  }

  function downloadDestination(value) {
    const url=new URL(value);
    if(url.protocol!=='https:'||url.username||url.password||url.port||!downloadHosts.has(url.hostname))throw new Error('GitHub 附件下载地址不受信任。');
    return url.href;
  }

  async function attachment(update,signal) {
    if(!update.privateAssetId)return fetch(update.url,{credentials:'omit',signal,cache:'no-store'});
    const token=await getCredential();
    if(!token)throw new Error('本机 GitHub 登录已不可用，请登录之后重新检查。');
    const response=await fetch(`${apiBase}/releases/assets/${update.privateAssetId}`,{
      credentials:'omit',signal,cache:'no-store',redirect:'manual',
      headers:{...apiHeaders('application/octet-stream'),Authorization:`Bearer ${token}`}
    });
    if(response.status>=300&&response.status<400){
      const location=response.headers.get('location');
      if(!location)throw new Error('GitHub 未返回私有附件下载地址。');
      // Signed storage URLs never receive the GitHub credential.
      return fetch(downloadDestination(location),{credentials:'omit',signal,cache:'no-store'});
    }
    return response;
  }

  async function download(update,temporary,task) {
    report(task,'downloading');
    const signal=AbortSignal.any([task.abort.signal,AbortSignal.timeout(480000)]);
    const response=await attachment(update,signal);
    const destination=new URL(response.url||update.url);
    if(!response.ok||!response.body||response.headers.get('content-type')?.includes('json')) {
      throw new Error(`GitHub 下载失败（HTTP ${response.status}）。`);
    }
    if(!update.privateAssetId||destination.origin!=='https://api.github.com')downloadDestination(destination.href);
    let seen=0,lastReport=0;
    const bound=new Transform({transform(buffer,_encoding,callback){
      seen+=buffer.length;
      if(seen>update.size)return callback(new Error('下载大小与发布信息不一致。'));
      if(Date.now()-lastReport>=180){lastReport=Date.now();report(task,'downloading',seen);}
      callback(null,buffer);
    }});
    await pipeline(Readable.fromWeb(response.body),bound,createWriteStream(temporary,{flags:'wx'}),{signal});
  }

  async function existing(file,update) {
    const stat=await fs.lstat(file).catch(error=>{if(error.code==='ENOENT')return null;throw error;});
    if(!stat)return 'missing';
    try {await verify(file,update);return 'verified';}
    catch {return 'different';}
  }

  async function stage(update,task) {
    const preferred=portableFile?path.dirname(portableFile):path.join(app.getPath('userData'),'updates');
    await fs.mkdir(preferred,{recursive:true});
    let target=path.join(preferred,update.name);
    const entry=await existing(target,update);
    if(entry==='verified')return target;
    if(entry==='different') {
      target=path.join(preferred,`${path.basename(update.name,'.exe')}-${update.sha256.slice(0,12)}.exe`);
      const alternate=await existing(target,update);
      if(alternate==='verified')return target;
      if(alternate!=='missing')throw new Error('更新目录中存在同名文件，请先移走该文件再试。');
    }
    const temp=await fs.mkdtemp(path.join(preferred,'.bili-update-'));
    const temporary=path.join(temp,update.name);
    try {
      if(update.file){report(task,'copying');await fs.copyFile(update.file,temporary);}
      else await download(update,temporary,task);
      report(task,'verifying',update.size);
      await verify(temporary,update);
      await fs.copyFile(temporary,target,constants.COPYFILE_EXCL);
      await verify(target,update);
      return target;
    } finally {await fs.unlink(temporary).catch(()=>{});await fs.rmdir(temp).catch(()=>{});}
  }

  async function install() {
    if(!app.isPackaged||process.platform!=='win32')throw new Error('请在 Windows 正式打包版中执行更新。');
    if(!candidate||operation)throw new Error('请先检查更新。');
    const task={update:candidate,abort:new AbortController(),phase:'preparing'};
    operation=task;
    try {
      report(task,'preparing');
      const executable=await stage(task.update,task);
      report(task,'restarting',task.update.size);
      app.relaunch({execPath:executable,args:mode==='portable'?[]:['/S','--updated','--force-run']});
      setTimeout(()=>app.quit(),100).unref();
      return {restarting:true};
    } catch(error){
      operation=null;
      if(task.abort.signal.aborted)throw new Error('已取消下载，可以重新开始。');
      throw error;
    }
  }
  function cancel() {
    const canceled=operation?.phase==='downloading';
    if(canceled)operation.abort.abort();
    return {canceled};
  }
  return {check,install,cancel,info:()=>summary('')};
}
module.exports={createUpdates,assetName,newer,verify,repository};
