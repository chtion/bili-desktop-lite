'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const files=fs.readdirSync('src').filter(n=>n.endsWith('.js')).map(n=>path.join('src',n));
for(const file of files){const r=spawnSync(process.execPath,['--check',file],{stdio:'inherit'});if(r.status!==0)process.exit(r.status||1);}
const tests=fs.readdirSync('test').filter(n=>n.endsWith('.test.js')).map(n=>path.join('test',n));
const result=spawnSync(process.execPath,['--test',...tests],{stdio:'inherit'});process.exit(result.status||0);
