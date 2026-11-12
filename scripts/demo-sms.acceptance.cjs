'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const setup=require('./demo-sms.cjs');
const flags={NODE_ENV:'test',VIEWS_LOCAL_REHEARSAL:'true',VIEWS_DEMO_SMS:'true'};
const marker='VIEWS_DISPOSABLE_CORE_TEST';
const db=value=>({query:async()=>({rows:[{marker:value}]})});
test('fails closed for every gate and database marker',async()=>{
 for(const key of Object.keys(flags))await assert.rejects(setup(db(marker),{...flags,[key]:undefined},()=>assert.fail()));
 await assert.rejects(setup(db(marker),{...flags,NODE_ENV:'production'},()=>assert.fail()));
 for(const value of [null,'views_local'])await assert.rejects(setup(db(value),flags,()=>assert.fail()));
 await assert.rejects(setup({query:async()=>{throw Error('offline')}},flags,()=>assert.fail()));
});
test('synthetic recipients only; logs explicit masked fields; rechecks gates',async()=>{
 const entries=[],env={...flags},adapter=await setup(db(marker),env,value=>entries.push(value));
 for(const phone of ['+998901234567','+998000000001x','998000000001'])assert.throws(()=>adapter.validateRecipient(phone));
 const message={phone:'+998000000001',code:'123456',locale:'ru',expiresInSeconds:300,idempotencyKey:'challenge'};
 await adapter.send(message);
 assert.deepEqual(entries,[{demoSms:true,challengeId:'challenge',maskedPhone:'+998*******01',code:'123456'}]);
 env.VIEWS_DEMO_SMS='false';await assert.rejects(adapter.send(message));assert.equal(entries.length,1);
});
test('writer errors propagate for uncertain-delivery handling',async()=>{
 const adapter=await setup(db(marker),flags,()=>{throw Error('writer unavailable')});
 await assert.rejects(adapter.send({phone:'+998000000001',code:'123456',idempotencyKey:'challenge'}));
});
