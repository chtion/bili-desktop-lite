'use strict';
const fs=require('node:fs');
fs.mkdirSync('src/vendor',{recursive:true});
for(const [from,to] of [['artplayer/dist/artplayer.js','artplayer.js'],['shaka-player/dist/shaka-player.dash.js','shaka.js'],['artplayer-plugin-danmuku/dist/artplayer-plugin-danmuku.js','danmuku.js'],['shaka-player/LICENSE','SHAKA-LICENSE']]) fs.copyFileSync('node_modules/'+from,'src/vendor/'+to);
console.log('Updated local Artplayer, Shaka DASH and danmaku bundles.');
