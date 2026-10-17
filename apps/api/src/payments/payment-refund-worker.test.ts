import {describe,expect,it,vi} from 'vitest';
import {PaymentRefundWorkerService} from './payment-refund-worker.service';
import {PaymentProviderRegistry} from './payment-provider.registry';
import {RefundNotSentError,type PaymentProviderPort} from './payment-provider.port';
import type {DatabaseService} from '../database/database.service';
import type {PaymentRecoveryService} from './payment-recovery.service';
function setup(error?:Error,connected=true){
 let status='pending',lastError='',external:string|null=null;
 const refund=vi.fn(async()=>{if(error)throw error;return {externalRefundId:'synthetic-refund',status:'pending' as const};});
 const registry=new PaymentProviderRegistry();if(connected)registry.register({provider:'payme',refund} as unknown as PaymentProviderPort);
 const queries:string[]=[];
 const db={withOrganization:async(_org:string,work:(c:unknown)=>unknown)=>work({query:async(sql:string,args:unknown[])=>{
  queries.push(sql);
  if(sql.includes("REFUND_LEASE_EXPIRED_RECONCILE")){if(status==='processing'){status='uncertain';lastError='REFUND_LEASE_EXPIRED_RECONCILE';}return {rows:[],rowCount:0};}
  if(sql.includes('WITH candidates')){if(status!=='pending')return {rows:[],rowCount:0};status='processing';return {rows:[{id:'request',payment_intent_id:'intent',provider:'payme',amount_minor:'100',currency:'UZS',idempotency_key:'key',external_capture_id:'capture',attempt_count:1}],rowCount:1};}
  if(sql.includes("SET status='submitted'")){status='submitted';external=args[0] as string;return {rows:[],rowCount:1};}
  if(sql.includes('SET status=$1')){status=args[0] as string;lastError=args[2] as string;return {rows:[],rowCount:1};}
  throw Error('UNEXPECTED_TEST_SQL');
 }})} as unknown as DatabaseService;
 const recovery={reconcileTenant:vi.fn(async()=>({}))} as unknown as PaymentRecoveryService;
 return {worker:new PaymentRefundWorkerService(db,registry,recovery),refund,queries,state:()=>({status,lastError,external}),expireLease:()=>{status='processing';}};
}
describe('refund delivery outcomes (unit fixture, no provider network)',()=>{
 it('records an acknowledged submission',async()=>{const s=setup();expect((await s.worker.processTenantBatch('org')).submitted).toBe(1);expect(s.state().external).toBe('synthetic-refund');});
 it('never resends after an ambiguous error and stores no arbitrary provider message',async()=>{
  const s=setup(Error('timeout with PRIVATE_PROVIDER_DATA'));expect((await s.worker.processTenantBatch('org')).uncertain).toBe(1);
  expect(s.state()).toEqual({status:'uncertain',lastError:'REFUND_DELIVERY_UNCERTAIN_RECONCILE',external:null});
  await s.worker.processTenantBatch('org');expect(s.refund).toHaveBeenCalledTimes(1);
 });
 it('blocks a missing provider without pretending delivery',async()=>{const s=setup(undefined,false);expect((await s.worker.processTenantBatch('org')).blocked).toBe(1);expect(s.state().status).toBe('blocked');expect(s.refund).not.toHaveBeenCalled();});
 it('retries only explicit proof that nothing was sent',async()=>{const s=setup(new RefundNotSentError());expect((await s.worker.processTenantBatch('org')).failed).toBe(1);expect(s.state().status).toBe('pending');});
 it('routes expired processing leases to reconciliation instead of another send',async()=>{const s=setup();s.expireLease();expect((await s.worker.processTenantBatch('org')).claimed).toBe(0);expect(s.state().status).toBe('uncertain');expect(s.refund).not.toHaveBeenCalled();});
});
