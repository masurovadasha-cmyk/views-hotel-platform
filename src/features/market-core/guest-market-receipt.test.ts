import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {GuestMarketReceive} from './GuestMarketReceive';
import {describe,expect,it} from 'vitest';
import {marketReceiptAttempt,assertMarketReceipt} from './guest-market-receipt';
import {retryable} from '../service-orders/model';
const id='00000000-0000-4000-8000-000000000042',key='00000000-0000-4000-8000-000000000043',total='9007199254740993';
const attempt=()=>marketReceiptAttempt(id,8,total,'UZS',key);
const receipt={orderId:id,revision:9,stage:'completed',totalMinor:total,currency:'UZS',idempotentReplay:false,lines:[{serviceId:key,name:{en:'Water'},quantity:1,priceMinor:total}],issue:null};
describe('market detail receipt contract',()=>{
 it.each(['reserved','picking','ready','completed','cancelled'])('hides receipt at %s',stage=>expect(renderToStaticMarkup(createElement(GuestMarketReceive,{order:{...receipt,stage},locale:'en',disabled:false,act:async()=>{}}))).toBe(''));
 it('hides receipt for an open issue',()=>expect(renderToStaticMarkup(createElement(GuestMarketReceive,{order:{...receipt,stage:'handed_over',issue:{status:'open',note:'Missing goods'}},locale:'en',disabled:false,act:async()=>{}}))).toBe(''));
 it('retains the observed exact charge outside the wire body and preserves the key',()=>expect(attempt()).toEqual({route:`services/market/${id}/actions`,key,body:{action:'confirm_receipt',expectedRevision:8},receiptExpectation:{totalMinor:total,currency:'UZS'}}));
 it.each([false,true])('accepts fresh or cached completion %s',idempotentReplay=>expect(()=>assertMarketReceipt({...receipt,idempotentReplay},structuredClone(attempt()))).not.toThrow());
 it('allows an answered concern',()=>expect(()=>assertMarketReceipt({...receipt,issue:{status:'answered',note:'Missing item',answer:'Delivered'}},attempt())).not.toThrow());
 it.each(['-1','01','1.2','9223372036854775808','',null,100])('rejects invalid money %j',v=>expect(()=>marketReceiptAttempt(id,8,v as string,'UZS',key)).toThrow());
 it.each([0,-1,1.5,NaN,Infinity,Number.MAX_SAFE_INTEGER])('rejects invalid revisions %j',v=>expect(()=>marketReceiptAttempt(id,v,total,'UZS',key)).toThrow());
 it.each([null,[],{},...[
  {orderId:key},{revision:8},{revision:10},{stage:'handed_over'},{currency:'EUR'},{totalMinor:'9007199254740992'},
  {idempotentReplay:undefined},{idempotentReplay:'true'},{lines:[]},{issue:{status:'open',note:'Missing item'}},
 ].map(p=>({...receipt,...p}))])('rejects mismatched responses without losing retry %j',r=>{expect(()=>assertMarketReceipt(r,attempt())).toThrow('INVALID_RESPONSE');expect(retryable('INVALID_RESPONSE')).toBe(true);});
 it('rejects other actions and missing expectations',()=>{
  expect(()=>assertMarketReceipt(receipt,{...attempt(),body:{action:'cancel',expectedRevision:8}})).toThrow('INVALID_RESPONSE');
  const {receiptExpectation,...missing}=attempt();expect(()=>assertMarketReceipt(receipt,missing)).toThrow('INVALID_RESPONSE');
 });
});
