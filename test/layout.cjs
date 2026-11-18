'use strict';
const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { setTimeout: delay } = require('node:timers/promises');
app.setPath('userData', path.resolve('.cache/layout-profile'));
require('../src/main');
async function run() {
  await app.whenReady();
  let win;
  for (let i=0;i<120;i++) {
    win=BrowserWindow.getAllWindows()[0];
    if (win && await win.webContents.executeJavaScript('!!document.querySelector(".video-card")').catch(()=>false)) break;
    await delay(250);
  }
  assert.ok(win);
  win.webContents.setBackgroundThrottling(false);
  win.show(); win.focus();
  for(let i=0;i<80;i++) {
    if(await win.webContents.executeJavaScript('[...document.querySelectorAll(".cover-button img")].filter(i => i.complete && i.naturalWidth>0).length >= 6')) break;
    await delay(250);
  }
  const results=[];
  for(const [width,height] of [[1040,720],[1920,1080],[1440,960]]) {
    win.setContentSize(width,height); await delay(400);
    const result=await win.webContents.executeJavaScript(`(()=>{
      const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width};};
      return {size:[innerWidth,innerHeight],header:rect(document.querySelector('.topbar')),search:rect(document.getElementById('search-form')),account:rect(document.getElementById('account')),grid:rect(document.querySelector('.video-grid')),overflow:document.getElementById('workspace').scrollWidth>document.getElementById('workspace').clientWidth,columns:getComputedStyle(document.querySelector('.video-grid')).gridTemplateColumns};
    })()`);
    assert.equal(result.overflow,false,JSON.stringify(result));
    assert.ok(result.account.right<result.search.x, 'Account stays inside the sidebar');
    assert.ok(result.account.bottom>height-40,'Account stays at the bottom');
    assert.ok(result.search.right<width-130,'Caption buttons remain clear');
    results.push(result);
  }
  for(const mode of ['light','dark']) {
    await win.webContents.executeJavaScript(`document.querySelector('[data-theme-mode="${mode}"]').click()`);
    await delay(500);
    const screenshot=await win.capturePage();
    fs.writeFileSync(`test-results/preview-${mode}.png`,screenshot.toPNG());
  }
  fs.writeFileSync('test-results/layout-v2.json',JSON.stringify({passed:true,results},null,2));
  console.log(JSON.stringify({passed:true,results},null,2));
  app.exit(0);
}
run().catch(e=>{console.error(e);app.exit(1)});
