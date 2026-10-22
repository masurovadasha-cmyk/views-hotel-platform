import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {GuestMarketReport} from './GuestMarketReport';
import {describe,expect,it} from 'vitest';
import {marketIssueAttempt,assertMarketIssueReceipt} from './guest-market-issue';
import {retryable} from '../service-orders/model';
const id='00000000-0000-4000-8000-000000000042',key='00000000-0000-4000-8000-000000000043',total='9007199254740993';
const attempt=()=>marketIssueAttempt(id,8,'handed_over',total,'UZS','  One item missing  ',key);
const receipt={orderId:id,revision:9,stage:'handed_over',totalMinor:total,currency:'UZS',idempotentReplay:false,lines:[{serviceId:key,name:{en:'Water'},quantity:1,priceMinor:total}],issue:{status:'open',note:'One item missing'}};
describe('market detail issue contract',()=>{
 it.each(['reserved','picking','ready','cancelled'])('hides reporting at %s',stage=>expect(renderToStaticMarkup(createElement(GuestMarketReport,{order:{...receipt,stage,issue:null},locale:'en',disabled:false,act:async()=>{}}))).toBe(''));
 it('hides reporting for an open issue',()=>expect(renderToStaticMarkup(createElement(GuestMarketReport,{order:{...receipt,stage:'handed_over',issue:{status:'open',note:'Missing goods'}},locale:'en',disabled:false,act:async()=>{}}))).toBe(''));
 it.each(['', 'ab', 'x'.repeat(1001),'bad\ntext'])('rejects invalid notes %j',note=>expect(()=>marketIssueAttempt(id,8,'handed_over',total,'UZS',note,key)).toThrow('SERVICE_INPUT_INVALID'));
 it.each(['handed_over','completed'])('permits reporting at %s without an open concern',stage=>{
  for(const issue of [null,{status:'answered',note:'Old concern',answer:'Checked'}])expect(renderToStaticMarkup(createElement(GuestMarketReport,{order:{...receipt,stage,issue},locale:'en',disabled:false,act:async()=>{}}))).toContain('Report an issue');
  expect(()=>assertMarketIssueReceipt({...receipt,stage},marketIssueAttempt(id,8,stage,total,'UZS','One item missing',key))).not.toThrow();
 });
 it('retains the observed exact charge outside the wire body and preserves the key',()=>expect(attempt()).toEqual({route:`services/market/${id}/actions`,key,body:{action:'report_issue',expectedRevision:8,note:'One item missing'},issueExpectation:{stage:'handed_over',totalMinor:total,currency:'UZS'}}));
 it.each([false,true])('accepts fresh or cached concern %s',idempotentReplay=>expect(()=>assertMarketIssueReceipt({...receipt,idempotentReplay},structuredClone(attempt()))).not.toThrow());
 it.each(['-1','01','1.2','9223372036854775808','',null,100])('rejects invalid money %j',v=>expect(()=>marketIssueAttempt(id,8,'handed_over',v as string,'UZS','One item missing',key)).toThrow());
 it.each([0,-1,1.5,NaN,Infinity,Number.MAX_SAFE_INTEGER])('rejects invalid revisions %j',v=>expect(()=>marketIssueAttempt(id,v,'handed_over',total,'UZS','One item missing',key)).toThrow());
 it.each([null,[],{},...[
  {orderId:key},{revision:8},{revision:10},{stage:'completed'},{currency:'EUR'},{totalMinor:'9007199254740992'},
  {idempotentReplay:undefined},{idempotentReplay:'true'},{lines:[]},{issue:{status:'open',note:'Different issue'}},
 ].map(p=>({...receipt,...p}))])('rejects mismatched responses without losing retry %j',r=>{expect(()=>assertMarketIssueReceipt(r,attempt())).toThrow('INVALID_RESPONSE');expect(retryable('INVALID_RESPONSE')).toBe(true);});
 it('rejects other actions and missing expectations',()=>{
  expect(()=>assertMarketIssueReceipt(receipt,{...attempt(),body:{action:'cancel',expectedRevision:8}})).toThrow('INVALID_RESPONSE');
  const {issueExpectation,...missing}=attempt();expect(()=>assertMarketIssueReceipt(receipt,missing)).toThrow('INVALID_RESPONSE');
 });
});
