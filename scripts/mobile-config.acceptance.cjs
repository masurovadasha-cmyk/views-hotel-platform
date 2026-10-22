const {test}=require('node:test'),assert=require('node:assert/strict');
const config=require('../apps/mobile/app.config.js');
test('guest/staff preview profiles are distinct; unknown mode fails closed',()=>{
 const saved=process.env.EXPO_PUBLIC_APP_MODE;
 try{
  delete process.env.EXPO_PUBLIC_APP_MODE;const guest=config().expo;
  process.env.EXPO_PUBLIC_APP_MODE='staff';const staff=config().expo;
  assert.notEqual(guest.android.package,staff.android.package);assert.notEqual(guest.ios.bundleIdentifier,staff.ios.bundleIdentifier);
  assert.equal(guest.extra.mode,'guest');assert.equal(staff.extra.mode,'staff');assert.equal(staff.extra.preview,true);
  process.env.EXPO_PUBLIC_APP_MODE='admin';assert.throws(config,/INVALID_MOBILE_MODE/);
 }finally{if(saved===undefined)delete process.env.EXPO_PUBLIC_APP_MODE;else process.env.EXPO_PUBLIC_APP_MODE=saved;}
});
