import {describe,expect,it} from 'vitest';
import {createRequire} from 'node:module';
import {laundryClaimAttempt,assertLaundryClaimReceipt,canReportLaundry} from './guest-laundry-claim';
import {retryable,type Attempt} from '../service-orders/model';
import type {LaundryClaimState} from './model';
const {projection}=createRequire(import.meta.url)('../../../apps/api/ops/guest-service-gateway.cjs');
const id='00000000-0000-4000-8000-000000000039',key='00000000-0000-4000-8000-000000000040',orderId='00000000-0000-4000-8000-000000000041';
const total='9007199254741000',at='2026-10-19T10:15:00.123456+00:00',stages=['accepted','washing','ready','delivered','closed'];
const fields={tag:'001',kind:'quality',note:'Please check this item'},report={action:'report_claim',at,...fields};
const items=[{tag:'001',description:'White shirt',priceMinor:'9007199254740993'},{tag:'002',description:'Trousers',priceMinor:'7'}];
const claim={status:'open',tag:fields.tag,kind:fields.kind,history:[report]};
const receipt={intakeId:id,revision:9,stage:'delivered',orderId,totalMinor:total,items,idempotentReplay:false,declaredCount:2,preferences:'No perfume',pickupAt:at,returnBy:at,currency:'UZS',claim};
const attempt=()=>laundryClaimAttempt(id,8,'delivered',total,'UZS',fields,key);
describe('laundry claim submission contract',()=>{
 it('snapshots the observed state outside the exact wire body and trims the submitted note',()=>{
  const source={...fields,note:'  Please check this item  '},observed={stage:'delivered',totalMinor:total,currency:'UZS'};
  const pending=laundryClaimAttempt(id,8,observed.stage,observed.totalMinor,observed.currency,source,key);source.note='Changed';observed.totalMinor='1';
  expect(pending).toEqual({route:`services/laundry/${id}/actions`,key,body:{action:'report_claim',expectedRevision:8,...fields},claimExpectation:{stage:'delivered',totalMinor:total,currency:'UZS'}});
  expect(()=>assertLaundryClaimReceipt(receipt,structuredClone(pending))).not.toThrow();
 });
 it.each(stages)('accepts a report at %s including after checkout or folio closure',stage=>{
  for(const currency of ['UZS','USD','EUR'])for(const idempotentReplay of [false,true])expect(()=>assertLaundryClaimReceipt({...receipt,stage,currency,idempotentReplay},laundryClaimAttempt(id,8,stage,total,currency,fields,key))).not.toThrow();
 });
 it('accepts exact int64 maximum and all supported claim kinds',()=>{
  for(const kind of ['quality','missing','damaged'])expect(laundryClaimAttempt(id,8,'closed','9223372036854775807','USD',{...fields,kind},key).body.kind).toBe(kind);
 });
 it('accepts the real gateway projection and a previous answered history',()=>{
  const prior={...report,note:'First concern'},wire=projection({...receipt,claim:{...claim,history:[prior,{action:'answer_claim',at,note:'Please check again'},report]}});
  expect(()=>assertLaundryClaimReceipt(wire,attempt())).not.toThrow();
 });
 it.each(['0','-1','1.2','01','1e3','9223372036854775808','',null,undefined,100,NaN])('rejects invalid exact money %j',money=>expect(()=>laundryClaimAttempt(id,8,'delivered',money as string,'UZS',fields,key)).toThrow('SERVICE_INPUT_INVALID'));
 it.each(['JPY','uzs','',null,undefined,123])('rejects unsupported currency %j',currency=>expect(()=>laundryClaimAttempt(id,8,'delivered',total,currency as string,fields,key)).toThrow('SERVICE_INPUT_INVALID'));
 it.each(['requested','received','quoted','cancelled','',null,undefined,[]])('rejects ineligible stage %j',stage=>expect(()=>laundryClaimAttempt(id,8,stage as string,total,'UZS',fields,key)).toThrow('SERVICE_INPUT_INVALID'));
 it.each([['invalid',8,key],[id,0,key],[id,-1,key],[id,1.5,key],[id,Infinity,key],[id,NaN,key],[id,Number.MAX_SAFE_INTEGER+1,key],[id,'8',key],[id,8,'invalid']] as const)('rejects invalid command %j',(intake,revision,commandKey)=>expect(()=>laundryClaimAttempt(intake,revision as number,'delivered',total,'UZS',fields,commandKey)).toThrow('SERVICE_INPUT_INVALID'));
 it.each([null,undefined,[],{},...[
  {tag:''},{tag:'abc'},{tag:'A'.repeat(25)},{tag:'A B'},{tag:['001']},{kind:'other'},{kind:['quality']},{note:'  a  '},{note:'x'.repeat(501)},{note:'abc\ndef'},{note:'abc\u007fdef'},{note:['Concern']},{note:null},
 ].map(patch=>({...fields,...patch}))])('rejects malformed report fields %j',input=>expect(()=>laundryClaimAttempt(id,8,'delivered',total,'UZS',input as typeof fields,key)).toThrow('SERVICE_INPUT_INVALID'));
 it('allows an eligible new or answered/resolved claim only below the history limit',()=>{
  for(const stage of stages){expect(canReportLaundry(stage)).toBe(true);expect(canReportLaundry(stage,null)).toBe(true);
   for(const status of ['answered','resolved'] as const)expect(canReportLaundry(stage,{...claim,status,history:Array(7).fill(report)} as LaundryClaimState)).toBe(true);
   for(const status of ['open','answered','resolved'] as const)expect(canReportLaundry(stage,{...claim,status,history:Array(8).fill(report)} as LaundryClaimState)).toBe(false);
   expect(canReportLaundry(stage,claim as LaundryClaimState)).toBe(false);
  }for(const stage of ['requested','received','quoted','cancelled',''])expect(canReportLaundry(stage)).toBe(false);
 });
 it.each([undefined,null,[],{}, {stage:'delivered',totalMinor:total},{stage:'delivered',currency:'UZS'},{stage:'closed',totalMinor:total,currency:'UZS'}])('keeps missing or mismatched observed metadata uncertain %j',claimExpectation=>expect(()=>assertLaundryClaimReceipt(receipt,{...attempt(),claimExpectation} as Attempt)).toThrow('INVALID_RESPONSE'));
 it('rejects another pending action and route',()=>{
  for(const patch of [{body:{...attempt().body,action:'resolve_claim'}},{route:`services/laundry/${key}/actions`},{key:'invalid'}])expect(()=>assertLaundryClaimReceipt(receipt,{...attempt(),...patch})).toThrow('INVALID_RESPONSE');
 });
 it.each([null,[],{},...[
  {intakeId:key},{stage:'closed'},{revision:8},{revision:10},{revision:'9'},{orderId:null},{orderId:'invalid'},{idempotentReplay:undefined},{idempotentReplay:'false'},
  {totalMinor:Number(total)},{totalMinor:'9007199254741001',items:[items[0],{...items[1],priceMinor:'8'}]},{currency:'EUR'},{returnBy:null},{items:[]},{items:[items[0],items[0]]},
  {claim:null},{claim:[]},{claim:{...claim,status:'answered'}},{claim:{...claim,tag:'002'}},{claim:{...claim,kind:'missing'}},{claim:{...claim,history:[]}},
  ...[{note:'Different concern'},{tag:'002'},{kind:'missing'},{action:'answer_claim'},{note:'abc\ndef'}].map(patch=>({claim:{...claim,history:[{...report,...patch}]}})),
 ].map(patch=>({...receipt,...patch}))])('keeps mismatched receipt or latest claim history uncertain %j',raw=>{
  expect(()=>assertLaundryClaimReceipt(raw,attempt())).toThrow('INVALID_RESPONSE');expect(retryable('INVALID_RESPONSE')).toBe(true);
 });
});
