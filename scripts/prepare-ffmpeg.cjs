'use strict';
const fs=require('node:fs/promises');
const {createReadStream,createWriteStream}=require('node:fs');
const {createHash}=require('node:crypto');
const {execFile}=require('node:child_process');
const path=require('node:path');
const {Readable}=require('node:stream');
const {pipeline}=require('node:stream/promises');
const {promisify}=require('node:util');
const run=promisify(execFile);
const cache=path.resolve(__dirname,'../.cache/ffmpeg');
const folder='ffmpeg-9.0.1-essentials_build';
const binary={name:`${folder}.7z`,url:`https://github.com/GyanD/codexffmpeg/releases/download/9.0.1/${folder}.7z`,
  sha256:'49a73bdf0850092a252ac4641d922f3048d63ed113e196cc65ce1e4f7fb33e85'};
const source={name:'ffmpeg-9.0.1-source.tar.gz',url:'https://codeload.github.com/FFmpeg/FFmpeg/tar.gz/bf1b838f2a',
  sha256:'88b7e61092a4633ce5cf335604dda75b83ef9c2f650fb5d56c8d30160363a058'};
const executableHash='72a489eccd008c2ec2c0a5856c5c75bc3d8bbfa90166c4566865c246445e6aa3';

async function hash(file) {
  const digest=createHash('sha256');
  for await(const bytes of createReadStream(file))digest.update(bytes);
  return digest.digest('hex');
}
async function ensure({name,url,sha256}) {
  const file=path.join(cache,name);
  if(await hash(file).catch(()=>null)===sha256)return file;
  const temporary=file+'.part';
  try{
    console.log(`Fetching ${name}`);
    const signal=AbortSignal.timeout(600000);
    const response=await fetch(url,{signal});
    if(!response.ok||!response.body)throw new Error(`${name} could not be downloaded (HTTP ${response.status}).`);
    await pipeline(Readable.fromWeb(response.body),createWriteStream(temporary),{signal});
    if(await hash(temporary)!==sha256)throw new Error(`${name} SHA-256 mismatch.`);
    await fs.rename(temporary,file);
    return file;
  }finally{await fs.unlink(temporary).catch(()=>{});}
}

async function prepare() {
  await fs.mkdir(cache,{recursive:true});
  const [archive]=await Promise.all([ensure(binary),ensure(source)]);
  const paths=['bin/ffmpeg.exe','LICENSE','README.txt'];
  const extracted=path.join(cache,folder);
  const bundle=path.join(cache,'bundle');
  const tar=path.join(process.env.SystemRoot||'C:\\Windows','System32','tar.exe');
  await run(tar,['-xf',archive,'-C',cache,...paths.map(file=>`${folder}/${file}`)],{windowsHide:true});
  if(await hash(path.join(extracted,paths[0]))!==executableHash)throw new Error('Extracted FFmpeg SHA-256 mismatch.');
  await fs.mkdir(bundle,{recursive:true});
  for(const file of paths)await fs.copyFile(path.join(extracted,file),path.join(bundle,path.basename(file)));
  console.log('Prepared FFmpeg 9.0.1, license and corresponding FFmpeg source archive.');
}
module.exports={source,cache,hash};
if(require.main===module)prepare().catch(error=>{console.error(error.message);process.exitCode=1;});
