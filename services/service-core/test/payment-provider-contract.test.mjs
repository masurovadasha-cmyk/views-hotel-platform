import test from "node:test";
import assert from "node:assert/strict";
import {assertPaymentProvider,requireVerifiedNotification} from "../src/payment-provider-contract.mjs";
test("supports only approved provider identifiers",()=>{
 for(const provider of ["payme","click","uzum"])assert.equal(assertPaymentProvider(provider),provider);
 assert.throws(()=>assertPaymentProvider("unknown"),/Unsupported/);
});
test("rejects unverified notifications and mismatched currency",()=>{
 const base={provider:"payme",providerEventId:"evt-1",intentId:"intent-1",amountUzs:45000,currency:"UZS"};
 assert.throws(()=>requireVerifiedNotification({...base,verified:false}),/Unverified/);
 assert.throws(()=>requireVerifiedNotification({...base,verified:true,currency:"USD"}),/Invalid provider amount/);
 assert.equal(requireVerifiedNotification({...base,verified:true}).amountUzs,45000);
});
