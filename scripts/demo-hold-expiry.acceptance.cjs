'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const start=require('./demo-hold-expiry.cjs');
const env={NODE_ENV:'test',VIEWS_LOCAL_REHEARSAL:'true',VIEWS_DEMO_SMS:'true'};
const db=marker=>({query:async()=>({rows:[{marker}]})});
const marker='VIEWS_DISPOSABLE_CORE_TEST';
test('rejects every missing flag and unmarked database without executing work',async()=>{
 const expire=async()=>assert.fail('work must not run');
 for(const key of Object.keys(env))await assert.rejects(start({db:db(marker),env:{...env,[key]:undefined},expire}));
 await assert.rejects(start({db:db('views_local'),env,expire}));
});
test('serializes ticks, drains work on stop, and never schedules after stop',async()=>{
 let release,calls=0;const gate=new Promise(r=>{release=r;});
 const worker=await start({db:db(marker),env,intervalMs:5,expire:async()=>{calls++;await gate;}});
 await new Promise(r=>setTimeout(r,25));assert.equal(calls,1);
 let stopped=false;const stop=worker.stop().then(()=>{stopped=true;});await new Promise(r=>setTimeout(r,5));assert.equal(stopped,false);
 release();await stop;const final=calls;await new Promise(r=>setTimeout(r,20));assert.equal(calls,final);
});
test('reports safe error code and retries without exposing database errors',async()=>{
 let calls=0;const errors=[];let resolve;const done=new Promise(r=>{resolve=r;});
 const worker=await start({db:db(marker),env,intervalMs:5,onError:code=>errors.push(code),expire:async()=>{calls++;if(calls===1)throw Error('PRIVATE_PASSWORD');resolve();}});
 await Promise.race([done,new Promise((_,reject)=>setTimeout(()=>reject(Error('timeout')),1000).unref())]);
 await worker.stop();assert.deepEqual(errors,['DEMO_HOLD_EXPIRY_FAILED']);assert.ok(calls>=2);
});
