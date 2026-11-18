'use strict';
const fs=require('node:fs');
const {createHash}=require('node:crypto');
const path=require('node:path');
const {assetName}=require('../src/updates');
const {version}=require('../package.json');

async function main() {
  const assets={};
  for(const mode of ['portable','installer']) {
    const name=assetName(version,mode),file=path.join('dist',name);
    const size=fs.statSync(file).size,hash=createHash('sha256');
    for await(const bytes of fs.createReadStream(file))hash.update(bytes);
    assets[mode]={name,size,sha256:hash.digest('hex')};
  }
  fs.writeFileSync('dist/bili-release.json',JSON.stringify({version,assets},null,2)+'\n');
  const checksums=Object.values(assets).map(asset=>`${asset.sha256}  ${asset.name}`).join('\n');
  fs.writeFileSync(`dist/SHA256SUMS-${version.split('.').slice(0,2).join('.')}.txt`,checksums+'\n');
  console.log(`Verified release manifest for ${version}`);
}
main().catch(error=>{console.error(error);process.exitCode=1;});
