'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {createHash}=require('node:crypto');
const {createUpdates,assetName,newer}=require('../src/updates');

test('updates compare numeric versions and reject prerelease or invalid versions',()=>{
  assert.equal(newer('2.10.0','2.9.8'),true);
  for(const version of ['2.4.0','2.5.0','2.6.0-beta','../2.9.0'])assert.equal(newer(version,'2.5.0'),false);
  assert.equal(newer('0.10.0','0.9.0'),true);
  for(const version of ['0.8.0','1.0.0','2.6.0'])assert.equal(newer(version,'0.9.0'),false);
});

test('a local update checks the matching asset and rechecks integrity before relaunch',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'bili-release-test-'));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const folder=path.join(root,'distribution'),running=path.join(root,'running');
  await fs.mkdir(folder);await fs.mkdir(running);
  const version='0.10.0',name=assetName(version,'portable'),data=Buffer.from('test image');
  const asset={name,size:data.length,sha256:createHash('sha256').update(data).digest('hex')};
  const executable=path.join(folder,name);
  await fs.writeFile(executable,data);
  await fs.writeFile(path.join(folder,'bili-release.json'),JSON.stringify({version,assets:{portable:asset}}));
  let launch=null;
  const updates=createUpdates({app:{getVersion:()=> '0.9.0',isPackaged:true,relaunch:args=>{launch=args;},quit(){}},
    portableFile:path.join(running,'Bili-Desktop-Lite-0.9.0-Portable-x64.exe'),chooseFolder:async()=>folder});
  assert.equal((await updates.check(true)).offer.version,version);
  await fs.writeFile(executable,Buffer.from('wrong file'));
  await assert.rejects(updates.install,/校验失败/);
  assert.equal(launch,null);
  if(process.platform==='win32') {
    await fs.writeFile(executable,data);
    assert.deepEqual(await updates.install(),{restarting:true});
    assert.equal(launch.execPath,path.join(running,name));
    assert.deepEqual(await fs.readFile(launch.execPath),data);
  }
});

test('the 0.x app does not offer a legacy GitHub release as an update',async()=>{
  const updates=createUpdates({app:{getVersion:()=> '0.9.0'},fetch:async()=>Response.json({tag_name:'v2.6.0'})});
  const result=await updates.check();
  assert.equal(result.offer,null);
  assert.match(result.message,/旧编号/);
});

test('GitHub updater rejects assets without a digest or with a foreign download URL',async()=>{
  const version='2.6.0',name=assetName(version,'installer');
  let digest='';
  const app={getVersion:()=> '2.5.0'};
  const updates=createUpdates({app,fetch:async()=>Response.json({tag_name:'v'+version,assets:[{name,state:'uploaded',size:123,digest,browser_download_url:'https://other.test/update.exe'}]})});
  await assert.rejects(updates.check(),/校验信息/);
  digest='sha256:'+'a'.repeat(64);
  await assert.rejects(updates.check(),/下载地址不匹配/);
});

test('GitHub release checks share the request and reuse a fresh result',async()=>{
  let calls=0;
  const updates=createUpdates({app:{getVersion:()=> '0.10.4'},fetch:async()=>{
    calls++;
    return Response.json({tag_name:'v0.10.4'});
  }});
  await Promise.all([updates.check(),updates.check()]);
  assert.match((await updates.check()).message,/最新/);
  assert.equal(calls,1);
});

test('REST rate limits suppress repeated requests until GitHub permits a retry',async()=>{
  const responses=[
    new Response(null,{status:429,headers:{'Retry-After':'180'}}),
    Response.json({message:'You have exceeded a secondary rate limit'},{status:403}),
    Response.json({message:'API rate limit exceeded'},{status:403,headers:{'X-RateLimit-Remaining':'0','X-RateLimit-Reset':String(Math.ceil(Date.now()/1000)+300)}})
  ];
  for(const response of responses){
    let calls=0;
    const updates=createUpdates({app:{getVersion:()=> '0.10.4'},fetch:async()=>{calls++;return response;}});
    await assert.rejects(updates.check(),/GitHub 暂时限制请求.*分钟/);
    await assert.rejects(updates.check(),/GitHub 暂时限制请求.*分钟/);
    assert.equal(calls,1);
  }
});

test('a private Release uses the Git login only on the API and verifies the file before running the installer',async t=>{
  if(process.platform!=='win32')return;
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'bili-private-release-test-'));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const version='0.10.0',name=assetName(version,'installer'),bytes=Buffer.from('private installer fixture');
  const sha256=createHash('sha256').update(bytes).digest('hex');
  const api='https://api.github.com/repos/chtion/bili-desktop-lite';
  const url=`https://github.com/chtion/bili-desktop-lite/releases/download/v${version}/${name}`;
  const cdn='https://release-assets.githubusercontent.com/private-attachment';
  const progress=[];
  let launched=null;
  const updates=createUpdates({
    app:{getVersion:()=> '0.9.0',getPath:()=>root,isPackaged:true,relaunch:args=>{launched=args;},quit(){}},
    getCredential:async()=> 'test-only-fixture-token',onProgress:event=>progress.push(event.phase),
    fetch:async(endpoint,options)=>{
      if(endpoint===`${api}/releases/latest`&&!options.headers.Authorization)return new Response(null,{status:404});
      if(endpoint===`${api}/releases/latest`)return Response.json({tag_name:`v${version}`,body:'Release notes',assets:[{id:123,name,state:'uploaded',size:bytes.length,digest:`sha256:${sha256}`,browser_download_url:url}]});
      if(endpoint===`${api}/releases/assets/123`){
        assert.equal(options.headers.Accept,'application/octet-stream');
        assert.equal(options.headers.Authorization,'Bearer test-only-fixture-token');
        assert.equal(options.redirect,'manual');
        return Response.redirect(cdn,302);
      }
      assert.equal(endpoint,cdn);
      assert.equal(options.headers?.Authorization,undefined);
      assert.equal(options.credentials,'omit');
      return new Response(bytes,{headers:{'Content-Type':'application/octet-stream'}});
    }
  });
  assert.equal((await updates.check()).offer.notes,'Release notes');
  assert.deepEqual(await updates.install(),{restarting:true});
  assert.deepEqual(await fs.readFile(launched.execPath),bytes);
  assert.deepEqual(launched.args,['/S','--updated','--force-run']);
  for(const phase of ['downloading','verifying','restarting'])assert.ok(progress.includes(phase));
});

test('cancel removes the partial download and allows a fresh retry',async t=>{
  if(process.platform!=='win32')return;
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'bili-cancel-test-'));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const version='0.10.0',name=assetName(version,'portable'),bytes=Buffer.from('complete verified download');
  const digest='sha256:'+createHash('sha256').update(bytes).digest('hex');
  const url=`https://github.com/chtion/bili-desktop-lite/releases/download/v${version}/${name}`;
  let block=true,launches=0,started;
  const began=new Promise(resolve=>{started=resolve;});
  const updates=createUpdates({
    app:{getVersion:()=> '0.9.0',isPackaged:true,relaunch(){launches++;},quit(){}},portableFile:path.join(root,'old.exe'),
    fetch:async endpoint=>{
      if(endpoint.endsWith('/latest'))return Response.json({tag_name:`v${version}`,assets:[{name,state:'uploaded',size:bytes.length,digest,browser_download_url:url}]});
      if(!block)return new Response(bytes);
      return new Response(new ReadableStream({start(controller){controller.enqueue(bytes.subarray(0,3));started();}}));
    }
  });
  assert.ok((await updates.check()).offer);
  const downloading=updates.install();
  await began;
  assert.deepEqual(updates.cancel(),{canceled:true});
  await assert.rejects(downloading,/已取消下载/);
  assert.deepEqual(await fs.readdir(root),[]);
  assert.equal(launches,0);
  block=false;
  await updates.install();
  assert.equal(launches,1);
});

test('interrupted public download resumes from the saved bytes and verifies the complete file',async t=>{
  if(process.platform!=='win32')return;
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'bili-resume-test-'));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const version='0.10.5',name=assetName(version,'portable'),bytes=Buffer.from('fixture with partial download and resume');
  const digest='sha256:'+createHash('sha256').update(bytes).digest('hex');
  const url=`https://github.com/chtion/bili-desktop-lite/releases/download/v${version}/${name}`;
  const cdn='https://release-assets.githubusercontent.com/fixture';
  const ranges=[];
  let launched;
  const updates=createUpdates({
    app:{getVersion:()=> '0.10.4',isPackaged:true,relaunch(options){launched=options;},quit(){}},portableFile:path.join(root,'old.exe'),
    getCredential:async()=>{throw new Error('Unexpected credential request');},
    fetch:async(endpoint,options)=>{
      if(endpoint.endsWith('/latest'))return Response.json({tag_name:`v${version}`,assets:[{name,state:'uploaded',size:bytes.length,digest,browser_download_url:url}]});
      if(endpoint===url)return Response.redirect(cdn,302);
      assert.equal(endpoint,cdn);
      ranges.push(options.headers.Range);
      if(ranges.length===1)return new Response(bytes.subarray(0,8));
      return new Response(bytes.subarray(8),{status:206,headers:{'Content-Range':`bytes 8-${bytes.length-1}/${bytes.length}`}});
    }
  });
  await updates.check();
  assert.deepEqual(await updates.install(),{restarting:true});
  assert.deepEqual(ranges,[undefined,'bytes=8-']);
  assert.deepEqual(await fs.readFile(launched.execPath),bytes);
});
