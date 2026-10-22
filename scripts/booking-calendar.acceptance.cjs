'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const {pathToFileURL}=require('node:url');
const path=require('node:path');
const moduleUrl=pathToFileURL(path.join(__dirname,'../src/domain/bookingQuote.ts')).href;
// Separate processes: TZ changes in a Vitest worker do not reliably affect Date.
for(const timezone of ['UTC','Asia/Tashkent','Europe/Berlin','America/New_York','Australia/Lord_Howe']){
  test('stay nights do not depend on device timezone: '+timezone,()=>{
    const script=`import {bookingQuote} from ${JSON.stringify(moduleUrl)};
      const stays=[['2026-10-25','2026-10-26',1],['2026-11-01','2026-11-02',1],
        ['2026-04-05','2026-04-06',1],['2026-03-08','2026-03-09',1],
        ['2026-10-24','2026-10-27',3],['2028-02-28','2028-03-01',2]];
      console.log(JSON.stringify(stays.map(([checkIn,checkOut])=>bookingQuote({
        checkIn,checkOut,nightlyRate:100,capacity:2,guests:1
      }).nights)));`;
    const result=spawnSync(process.execPath,['--experimental-strip-types','--input-type=module','-e',script],{
      encoding:'utf8',env:{...process.env,TZ:timezone}
    });
    assert.equal(result.status,0,result.stderr);
    assert.deepEqual(JSON.parse(result.stdout),[1,1,1,1,3,2]);
  });
}
