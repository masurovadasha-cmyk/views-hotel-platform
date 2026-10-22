import {describe,it,expect} from 'vitest';
import {laundryResolveAttempt,assertLaundryResolveReceipt} from './guest-laundry-resolve';
import type {LaundryClaimState} from './model';
import type {Attempt} from '../service-orders/model';
const id='00000000-0000-4000-8000-000000000040',key='00000000-0000-4000-8000-000000000041',at='2026-10-19T10:00:00Z',total='9007199254740993';
const report={action:'report_claim' as const,at,tag:'001',kind:'damaged',note:'Torn sleeve'};
const claim:LaundryClaimState={status:'open',tag:'001',kind:'damaged',history:[report]};
const attempt=()=>laundryResolveAttempt(id,8,'delivered',total,'UZS',claim,key);
const receipt={intakeId:id,revision:9,stage:'delivered',orderId:key,totalMinor:total,currency:'UZS',idempotentReplay:false,declaredCount:1,preferences:'',pickupAt:at,returnBy:at,items:[{tag:'001',description:'Shirt',priceMinor:total}],claim:{...claim,status:'resolved',history:[report,{action:'resolve_claim',at,note:''}]}};
describe('laundry claim resolution contract',()=>{
 it('sends only action/revision and snapshots consent outside the body',()=>{
  const source=structuredClone(claim),a=laundryResolveAttempt(id,8,'delivered',total,'UZS',source,key);source.tag='002';source.history.push(report);
  expect(a.body).toEqual({action:'resolve_claim',expectedRevision:8});expect(a.key).toBe(key);
  expect(a.resolveExpectation).toEqual({stage:'delivered',totalMinor:total,currency:'UZS',tag:'001',kind:'damaged',historyLength:1});
  expect(()=>assertLaundryResolveReceipt(receipt,structuredClone(a))).not.toThrow();
 });
 it.each(['open','answered'] as const)('allows %s at the eight-message limit and closed stage',status=>{
  const c={...claim,status,history:Array(8).fill(report)},a=laundryResolveAttempt(id,8,'closed',total,'EUR',c,key);
  expect(()=>assertLaundryResolveReceipt({...receipt,stage:'closed',currency:'EUR',idempotentReplay:true,claim:{...receipt.claim,history:[...c.history,{action:'resolve_claim',at,note:''}]}},a)).not.toThrow();
 });
 it.each([null,undefined,{...claim,status:'resolved'},{...claim,tag:'bad tag'},{...claim,kind:'other'},{...claim,history:[]},{...claim,history:Array(9).fill(report)}])('rejects ineligible concern %j',c=>expect(()=>laundryResolveAttempt(id,8,'delivered',total,'UZS',c as LaundryClaimState,key)).toThrow('SERVICE_INPUT_INVALID'));
 it.each([['bad',8,'delivered',total,'UZS',key],[id,0,'delivered',total,'UZS',key],[id,1.5,'delivered',total,'UZS',key],[id,8,'requested',total,'UZS',key],[id,8,'delivered','01','UZS',key],[id,8,'delivered','9223372036854775808','UZS',key],[id,8,'delivered',total,'JPY',key],[id,8,'delivered',total,'UZS','bad']] as const)('rejects invalid metadata %j',(i,r,s,m,c,k)=>expect(()=>laundryResolveAttempt(i,r,s,m,c,claim,k)).toThrow('SERVICE_INPUT_INVALID'));
 it.each([null,{},[],...[
  {intakeId:key},{revision:8},{stage:'closed'},{totalMinor:'1',items:[{...receipt.items[0],priceMinor:'1'}]},{currency:'USD'},{orderId:null},{idempotentReplay:'false'},
  {claim:null},{claim:{...receipt.claim,status:'open'}},{claim:{...receipt.claim,tag:'002'}},{claim:{...receipt.claim,kind:'quality'}},
  ...[[],[report],[report,report,{action:'resolve_claim',at,note:''}],[report,{action:'resolve_claim',at,note:'Unexpected'}],[report,{action:'answer_claim',at,note:'Answer'}]].map(history=>({claim:{...receipt.claim,history}})),
 ].map(p=>({...receipt,...p}))])('retains an invalid response as uncertain %j',r=>expect(()=>assertLaundryResolveReceipt(r,attempt())).toThrow('INVALID_RESPONSE'));
 it.each([{},null,{...attempt(),resolveExpectation:null},{...attempt(),body:{action:'confirm_receipt',expectedRevision:8}},{...attempt(),route:'wrong'}])('rejects missing or mismatched pending expectations',a=>expect(()=>assertLaundryResolveReceipt(receipt,a as Attempt)).toThrow('INVALID_RESPONSE'));
});
