'use strict';
const fs=require('node:fs/promises');
const {createReadStream}=require('node:fs');
const path=require('node:path');
const {Readable}=require('node:stream');
const {execFileSync}=require('node:child_process');
const {assetName,repository,verify}=require('../src/updates');
const {readGitHubCredential}=require('../src/github-credentials');
const {version}=require('../package.json');

const root=path.resolve(__dirname,'..');
const output=path.join(root,'dist');
const tag=`v${version}`;
const api=`https://api.github.com/repos/${repository}`;
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',windowsHide:true}).trim();

async function publish() {
  if(process.argv.slice(2).join(' ')!=='--publish')throw new Error('Pass --publish to upload verified release assets and publish the release.');
  if(!/^0\.\d+\.\d+$/.test(version))throw new Error('The version must be on the 0.x development line.');
  if(git('status','--porcelain'))throw new Error('Commit the release source and notes before publishing.');
  const commit=git('rev-parse','HEAD');
  if(git('rev-parse',`${tag}^{commit}`)!==commit)throw new Error('The release tag must point to the current commit.');

  const manifest=JSON.parse(await fs.readFile(path.join(output,'bili-release.json'),'utf8'));
  if(manifest.version!==version)throw new Error('The build manifest version does not match package.json.');
  const assets=[];
  for(const mode of ['portable','installer']) {
    const asset=manifest.assets?.[mode];
    if(asset?.name!==assetName(version,mode))throw new Error(`The manifest does not have the expected ${mode} EXE.`);
    const file=path.join(output,asset.name);
    await verify(file,asset);
    assets.push({...asset,file});
  }
  const notes=await fs.readFile(path.join(root,'RELEASE_NOTES.md'),'utf8');
  if(!notes.startsWith(`# ${tag}\n`)&&!notes.startsWith(`# ${tag}\r\n`))throw new Error('Update RELEASE_NOTES.md for the release tag.');

  const token=await readGitHubCredential(repository,root);
  if(!token)throw new Error('Sign into GitHub through Git Credential Manager before publishing.');
  const headers={Authorization:`Bearer ${token}`,'User-Agent':'BiliLiteReleasePublisher','X-GitHub-Api-Version':'2022-11-28'};
  async function request(endpoint,options={}) {
    const {label='GitHub request',timeout=20000,headers:extra,...init}=options;
    const response=await fetch(endpoint,{...init,headers:{...headers,Accept:'application/vnd.github+json',...extra},redirect:'error',signal:AbortSignal.timeout(timeout)});
    if(!response.ok)throw new Error(`${label} failed (HTTP ${response.status}).`);
    return response.json();
  }
  const repo=await request(api,{label:'Repository access check'});
  if(repo.full_name.toLowerCase()!==repository.toLowerCase()||!repo.permissions?.push)throw new Error('The Git account cannot publish to the configured repository.');
  const ref=await request(`${api}/git/ref/tags/${tag}`,{label:'Pushed tag check'});
  const object=ref.object.type==='tag'?(await request(`${api}/git/tags/${ref.object.sha}`)).object:ref.object;
  if(object.type!=='commit'||object.sha!==commit)throw new Error('Push the release tag for the current commit before publishing.');

  const releases=await request(`${api}/releases?per_page=100`,{label:'Release lookup'});
  let release=releases.find(entry=>entry.tag_name===tag);
  if(!release)release=await request(`${api}/releases`,{
    method:'POST',headers:{'Content-Type':'application/json'},label:'Draft release creation',
    body:JSON.stringify({tag_name:tag,target_commitish:commit,name:`Bili Lite ${version}`,body:notes,draft:true,prerelease:false})
  });
  if(!Number.isSafeInteger(release.id)||release.id<1)throw new Error('GitHub did not return a valid release ID.');
  const matching=(record,asset)=>record?.state==='uploaded'&&record.size===asset.size&&record.digest===`sha256:${asset.sha256}`;
  for(const asset of assets) {
    const previous=release.assets?.find(record=>record.name===asset.name);
    if(matching(previous,asset))continue;
    if(previous)throw new Error(`Remove the incomplete or different ${asset.name} from the draft release before retrying.`);
    if(!release.draft)throw new Error(`The published release is missing the verified attachment ${asset.name}.`);
    console.log(`Uploading ${asset.name} (${Math.ceil(asset.size/1048576)} MB)`);
    const uploaded=await request(`https://uploads.github.com/repos/${repository}/releases/${release.id}/assets?${new URLSearchParams({name:asset.name})}`,{
      method:'POST',headers:{'Content-Type':'application/octet-stream','Content-Length':String(asset.size)},
      body:Readable.toWeb(createReadStream(asset.file)),duplex:'half',timeout:600000,label:`Upload ${asset.name}`
    });
    if(!matching(uploaded,asset))throw new Error(`GitHub's size or SHA-256 does not match for ${asset.name}. The release is still a draft.`);
  }
  release=await request(`${api}/releases/${release.id}`,{label:'Uploaded attachment verification'});
  if(!assets.every(asset=>matching(release.assets?.find(record=>record.name===asset.name),asset)))throw new Error('Remote release attachment verification failed.');
  if(release.draft)release=await request(`${api}/releases/${release.id}`,{
    method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({draft:false,make_latest:'true'}),label:'Release publication'
  });
  if(release.draft||release.prerelease)throw new Error('The release is not the regular published update channel.');
  console.log(`Published ${release.html_url} from ${commit.slice(0,12)} (${repo.visibility}).`);
}

publish().catch(error=>{console.error(error.message);process.exitCode=1;});
