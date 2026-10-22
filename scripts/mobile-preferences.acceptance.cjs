const {test}=require('node:test');
const assert=require('node:assert/strict');
const {decodePreferences,createPreferencesStore}=require('../apps/mobile/preferences.ts');
test('preferences validate version, damaged JSON and unsupported values',()=>{
 for(const raw of [null,'{','null','[]','{"version":2,"theme":"dark"}','{"version":1,"locale":"xx","theme":"unknown"}'])
  assert.deepEqual(decodePreferences(raw),{locale:'ru',theme:'light'});
 assert.deepEqual(decodePreferences('{"version":1,"locale":"uz","theme":"dark","token":"ignored"}'),{locale:'uz',theme:'dark'});
});
test('all languages and themes survive a new store instance',async()=>{
 let disk=null; const io={read:async()=>disk,write:async value=>{disk=value;}};
 for(const locale of ['ru','uz','en']) for(const theme of ['light','dark']){
  await createPreferencesStore(io).save({locale,theme});
  assert.deepEqual(await createPreferencesStore(io).load(),{locale,theme});
  assert.deepEqual(Object.keys(JSON.parse(disk)).sort(),['locale','theme','version']);
 }
});
test('writes are serialized and failure does not poison subsequent saves',async()=>{
 let release; const writes=[];
 const store=createPreferencesStore({read:async()=>null,write:async value=>{
  writes.push(JSON.parse(value));
  if(writes.length===1) await new Promise(resolve=>{release=resolve;});
  if(writes.length===2) throw Error('disk unavailable');
 }});
 const first=store.save({locale:'ru',theme:'light'});
 const second=store.save({locale:'uz',theme:'dark'});
 const rejected=assert.rejects(second,/disk unavailable/);
 const third=store.save({locale:'en',theme:'dark'});
 await Promise.resolve();assert.equal(writes.length,1);release();
 await Promise.all([first,rejected,third]);assert.equal(writes.length,3);
 assert.equal(writes[2].locale,'en');
});
test('read failure is surfaced rather than presented as restored preferences',async()=>{
 const store=createPreferencesStore({read:async()=>{throw Error('unavailable');},write:async()=>{}});
 await assert.rejects(store.load(),/unavailable/);
});
