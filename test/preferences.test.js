'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
const {defaults,accelerator,normalize,createPreferences}=require('../src/preferences');
const {fromEvent,isLocal}=require('../src/shortcut-keys');
test('shortcut validation accepts single keys and rejects duplicates and reserved keys',()=>{
  assert.equal(accelerator('Alt+Ctrl+B'),'Control+Alt+B');assert.equal(accelerator('F8'),'F8');
  assert.equal(accelerator('b'),'B');assert.equal(accelerator('Shift+B'),'Shift+B');
  for(const key of ['F5','Alt+F4','Ctrl+Ctrl+B','Control+F99','Super+B'])assert.throws(()=>accelerator(key));
  assert.throws(()=>normalize({bossKey:'F8',pinKey:'F8'}));assert.throws(()=>normalize({bossPause:'yes'}));
});
test('symbol keys use the same physical key for recording and playback',()=>{
  assert.equal(fromEvent({key:'?',code:'Slash',shiftKey:true}),'Shift+/');
  assert.equal(fromEvent({key:'+',code:'Equal',shiftKey:true,ctrlKey:true}),'Control+Shift+=');
  assert.equal(accelerator('Alt+Ctrl+['),'Control+Alt+[');
  assert.equal(accelerator("'"),"'");
  assert.ok(isLocal('Shift+/'));
  assert.ok(!isLocal('Control+;'));
});
test('settings persist and shortcut changes roll back on conflicts; swapping and capture work',()=>{
  const dir=path.resolve('.cache','preferences-test-'+randomUUID());
  const callbacks=new Map(),busy=new Set(),invoked=[];
  const shortcuts={register(key,fn){if(busy.has(key)||callbacks.has(key))return false;callbacks.set(key,fn);return true;},unregister(key){callbacks.delete(key);}};
  const prefs=createPreferences(dir,shortcuts,{boss:()=>invoked.push('boss'),pin:()=>invoked.push('pin')});
  prefs.save({webFullscreen:true});assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'preferences.json'))).webFullscreen,true);
  busy.add('Control+F9');assert.throws(()=>prefs.save({bossKey:'Control+F8',pinKey:'Control+F9'}));
  assert.ok(!callbacks.has('Control+F8'));assert.ok(callbacks.has(defaults.bossKey));assert.equal(prefs.get().values.bossKey,defaults.bossKey);
  prefs.save({bossKey:defaults.pinKey,pinKey:defaults.bossKey});callbacks.get(defaults.pinKey)();assert.deepEqual(invoked,['boss']);
  prefs.suspend();assert.equal(callbacks.size,0);prefs.resume();assert.equal(callbacks.size,2);
  prefs.save({pinKey:'P'});assert.equal(callbacks.has('P'),false);assert.equal(prefs.get().values.pinKey,'P');
  prefs.dispose();const restarted=createPreferences(dir,shortcuts,{boss:()=>{},pin:()=>{}});assert.equal(restarted.get().values.webFullscreen,true);assert.equal(restarted.get().values.bossKey,defaults.pinKey);restarted.dispose();assert.equal(callbacks.size,0);
});
