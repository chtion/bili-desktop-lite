'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {assetName}=require('../src/updates');
const {version}=require('../package.json');
const {source,cache,hash}=require('./prepare-ffmpeg.cjs');

async function main() {
  const assets={};
  for(const mode of ['portable','installer']) {
    const name=assetName(version,mode),file=path.join('dist',name);
    assets[mode]={name,size:fs.statSync(file).size,sha256:await hash(file)};
  }
  const sourceFile=path.join('dist',source.name);
  fs.copyFileSync(path.join(cache,source.name),sourceFile);
  if(await hash(sourceFile)!==source.sha256)throw new Error('FFmpeg source archive SHA-256 mismatch.');
  const sourceAsset={name:source.name,size:fs.statSync(sourceFile).size,sha256:source.sha256};
  fs.writeFileSync('dist/bili-release.json',JSON.stringify({version,assets,source:sourceAsset},null,2)+'\n');
  const checksums=[...Object.values(assets),sourceAsset].map(asset=>`${asset.sha256}  ${asset.name}`).join('\n');
  fs.writeFileSync(`dist/SHA256SUMS-${version}.txt`,checksums+'\n');
  console.log(`Verified release manifest for ${version}`);
}
main().catch(error=>{console.error(error);process.exitCode=1;});
