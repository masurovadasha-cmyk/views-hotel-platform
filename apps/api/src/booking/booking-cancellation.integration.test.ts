import {afterAll,afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {DatabaseService} from '../database/database.service';
import {CancellationPreviewService} from '../rates/cancellation-preview.service';
import {QuoteService} from '../rates/quote.service';
import {BookingHoldService} from './booking-hold.service';
import {BookingLifecycleService} from './booking-lifecycle.service';
import {BookingCancellationService} from './booking-cancellation.service';
import {LedgerService} from '../payments/ledger.service';
import {PaymentRecoveryService} from '../payments/payment-recovery.service';
import {PaymentWebhookService} from '../payments/payment-webhook.service';
import {PaymentRefundWorkerService} from '../payments/payment-refund-worker.service';
import type {PaymentProviderPort} from '../payments/payment-provider.port';
import {PaymentProviderRegistry} from '../payments/payment-provider.registry';
const db=new DatabaseService(),ledger=new LedgerService(),recovery=new PaymentRecoveryService(db,ledger);
const service=new BookingCancellationService(db,recovery),webhooks=new PaymentWebhookService(db,new PaymentProviderRegistry(),ledger,recovery);
const actor={organizationId:'00000000-0000-0000-0000-000000000001',userId:'20000000-0000-4000-8000-000000000001',membershipId:'30000000-0000-4000-8000-000000000001',requestId:randomUUID()};
const property='00000000-0000-0000-0000-000000000002',type='00000000-0000-0000-0000-000000000003';
async function event(intent:string,kind:'captured'|'refunded',amount:bigint,related?:string){
 const external=randomUUID();
 await webhooks.processVerified('payme',{organizationId:actor.organizationId,paymentIntentId:intent,externalEventId:randomUUID(),externalTransactionId:external,relatedExternalTransactionId:related,eventType:kind,amountMinor:amount,currency:'UZS',occurredAt:new Date().toISOString(),rawMetadata:{synthetic:true}},JSON.stringify({synthetic:external}));return external;
}
async function fixture(paidBps=10000){
 const unit=randomUUID(),rate=randomUUID(),policy=randomUUID(),intent=randomUUID();
 await db.withActor(actor,async c=>{
  await c.query('INSERT INTO units(id,property_id,unit_type_id,code) VALUES($1,$2,$3,$4)',[unit,property,type,unit]);
  await c.query(`INSERT INTO cancellation_policy_templates(id,organization_id,code,name,rules) VALUES($1,$2,$3,'{"en":"Synthetic cancellation"}','{"version":1,"rules":[{"minHoursBeforeCheckIn":0,"refundBps":5000}],"nonRefundableLineCodes":[]}')`,[policy,actor.organizationId,policy]);
  await c.query(`INSERT INTO rate_plans(id,property_id,unit_type_id,name,currency,base_nightly_minor,cancellation_policy_id) VALUES($1,$2,$3,'{"en":"Synthetic"}','UZS',10000,$4)`,[rate,property,type,policy]);
 });
 const quote=await new QuoteService(db).createQuote({actor,propertyId:property,unitId:unit,ratePlanId:rate,checkInAt:'2030-06-01T14:00+05:00',checkOutAt:'2030-06-03T12:00+05:00',guests:[{age:30,residency:'resident'}]});
 const hold=await new BookingHoldService(db).createHold({actor,quoteId:quote.quoteId,idempotencyKey:randomUUID(),ttlSeconds:300});
 await db.withActor(actor,c=>c.query(`INSERT INTO payment_intents(id,organization_id,reservation_id,quote_id,provider,amount_minor,currency,idempotency_key) VALUES($1,$2,$3,$4,'payme',$5,'UZS',$1::uuid::text)`,[intent,actor.organizationId,hold.reservationId,quote.quoteId,quote.totalMinor.toString()]));
 const captured=quote.totalMinor*BigInt(paidBps)/10000n;
 const capture=captured?await event(intent,'captured',captured):null;
 if(paidBps<10000)await new BookingLifecycleService(db).confirmHold(actor,hold.reservationId,randomUUID());
 return {reservation:hold.reservationId,intent,capture,captured,quote,unit};
}
beforeEach(()=>{vi.stubEnv('NODE_ENV','test');vi.stubEnv('VIEWS_LOCAL_REHEARSAL','true');vi.stubEnv('VIEWS_CANCELLATION_PILOT_ENABLED','true');});
afterEach(()=>vi.unstubAllEnvs());afterAll(()=>db.onModuleDestroy());
describe.sequential('policy cancellation and recovery',()=>{
 it('atomically cancels and limits repeated recovery to the frozen partial refund',async()=>{
  const f=await fixture(),key=randomUUID(),result=await service.cancel(actor,f.reservation,key);
  expect(result.refundMinor).toBe('10000');expect(result.penaltyMinor).toBe((f.quote.totalMinor-10000n).toString());
  expect(await service.cancel(actor,f.reservation,key)).toEqual({...result,idempotentReplay:true});
  await recovery.reconcileTenant(actor.organizationId);await recovery.reconcileTenant(actor.organizationId);
  await db.withActor(actor,async c=>{
   expect((await c.query('SELECT count(*)::int n FROM inventory_periods WHERE reservation_id=$1',[f.reservation])).rows[0].n).toBe(0);
   expect((await c.query('SELECT amount_minor::text,reason FROM payment_refund_requests WHERE payment_intent_id=$1',[f.intent])).rows).toEqual([{amount_minor:'10000',reason:'booking_policy_cancellation'}]);
   expect((await c.query('SELECT count(*)::int n FROM audit_log WHERE entity_id=$1 AND action=$2',[f.reservation,'booking.policy_cancelled'])).rows[0].n).toBe(1);
  });
  await event(f.intent,'refunded',10000n,f.capture!);
  await db.withOrganization(actor.organizationId,c=>recovery.ensureRefundsForIntent(c,{organizationId:actor.organizationId,paymentIntentId:f.intent,provider:'payme',currency:'UZS',reservationId:f.reservation}));
  await db.withActor(actor,async c=>expect((await c.query('SELECT count(*)::int n FROM payment_refund_requests WHERE payment_intent_id=$1',[f.intent])).rows[0].n).toBe(1));
 });
 it('returns only actual prepayment above the penalty and refunds a later capture separately',async()=>{
  const f=await fixture(8000),result=await service.cancel(actor,f.reservation,randomUUID());
  const penalty=f.quote.totalMinor-10000n,expected=f.captured>penalty?f.captured-penalty:0n;
  expect(result.refundMinor).toBe(expected.toString());
  const later=f.quote.totalMinor-f.captured;await event(f.intent,'captured',later);
  await db.withActor(actor,async c=>{
   const rows=(await c.query('SELECT amount_minor::text amount,external_capture_id FROM payment_refund_requests WHERE payment_intent_id=$1',[f.intent])).rows;
   expect(rows.find(r=>r.external_capture_id===f.capture)?.amount).toBe(expected.toString());
   expect(rows.filter(r=>r.external_capture_id!==f.capture).map(r=>r.amount)).toEqual([later.toString()]);
  });
 });
 it('requires reconciliation for a pre-existing refund workflow before altering the booking',async()=>{
  const f=await fixture();
  await event(f.intent,'refunded',100n,f.capture!);
  await db.withActor(actor,c=>c.query(`INSERT INTO payment_refund_requests(organization_id,payment_intent_id,provider,amount_minor,currency,reason,idempotency_key,external_capture_id,status,completed_at) VALUES($1,$2,'payme',100,'UZS','synthetic_prior_refund',$3,$4,'completed',now())`,[actor.organizationId,f.intent,randomUUID(),f.capture]));
  await expect(service.cancel(actor,f.reservation,randomUUID())).rejects.toThrow('CANCELLATION_RECONCILIATION_REQUIRED');
  await db.withActor(actor,async c=>expect((await c.query('SELECT status FROM reservations WHERE id=$1',[f.reservation])).rows[0].status).toBe('confirmed'));
 });
 it('serializes cancellation retries without duplicate refunds or events',async()=>{
  const f=await fixture(),key=randomUUID(),results=await Promise.all(Array.from({length:3},()=>service.cancel(actor,f.reservation,key)));
  expect(results.filter(r=>!r.idempotentReplay)).toHaveLength(1);
  await expect(service.cancel(actor,f.reservation,randomUUID())).rejects.toThrow('CANCELLATION_NOT_AVAILABLE');
 });
 it('denies wrong actors before replay, and remains disabled without the local pilot flag',async()=>{
  const f=await fixture(),key=randomUUID();
  await expect(new CancellationPreviewService(db).preview({...actor,userId:'20000000-0000-4000-8000-000000000002'},f.reservation)).rejects.toThrow('PROPERTY_FORBIDDEN');
  await service.cancel(actor,f.reservation,key);
  await expect(service.cancel({...actor,userId:'20000000-0000-4000-8000-000000000002'},f.reservation,key)).rejects.toThrow('PROPERTY_FORBIDDEN');
  vi.stubEnv('VIEWS_CANCELLATION_PILOT_ENABLED','');await expect(service.cancel(actor,f.reservation,key)).rejects.toThrow('CANCELLATION_DISABLED');
 });
 it('persists unknown refund delivery and expired leases without a second provider call',async()=>{
  const f=await fixture();await service.cancel(actor,f.reservation,randomUUID());
  const calls:string[]=[],providers=new PaymentProviderRegistry();
  providers.register({provider:'payme',refund:async(request:{paymentIntentId:string})=>{calls.push(request.paymentIntentId);throw Error('SYNTHETIC_TIMEOUT_PRIVATE_PAYLOAD');}} as unknown as PaymentProviderPort);
  const worker=new PaymentRefundWorkerService(db,providers,recovery);
  await worker.processTenantBatch(actor.organizationId,100);await worker.processTenantBatch(actor.organizationId,100);
  expect(calls.filter(id=>id===f.intent)).toHaveLength(1);
  await db.withActor(actor,async c=>expect((await c.query('SELECT status,last_error FROM payment_refund_requests WHERE payment_intent_id=$1',[f.intent])).rows).toEqual([{status:'uncertain',last_error:'REFUND_DELIVERY_UNCERTAIN_RECONCILE'}]));
  const expired=await fixture();await service.cancel(actor,expired.reservation,randomUUID());
  await db.withActor(actor,c=>c.query("UPDATE payment_refund_requests SET status='processing',lease_until=now()-interval '1 minute',locked_by='synthetic-crashed-worker' WHERE payment_intent_id=$1",[expired.intent]));
  await worker.processTenantBatch(actor.organizationId,100);
  expect(calls.filter(id=>id===expired.intent)).toHaveLength(0);
  await db.withActor(actor,async c=>expect((await c.query('SELECT status FROM payment_refund_requests WHERE payment_intent_id=$1',[expired.intent])).rows[0].status).toBe('uncertain'));
 });
 it('settles uncertain and blocked deliveries from verified callbacks against refunds payable exactly once',async()=>{
  for(const status of ['uncertain','blocked']){
   const f=await fixture();await service.cancel(actor,f.reservation,randomUUID());
   await db.withActor(actor,c=>c.query('UPDATE payment_refund_requests SET status=$1 WHERE payment_intent_id=$2',[status,f.intent]));
   const tx=await event(f.intent,'refunded',10000n,f.capture!);
   await db.withActor(actor,async c=>{
    expect((await c.query('SELECT status,locked_by,lease_until FROM payment_refund_requests WHERE payment_intent_id=$1',[f.intent])).rows).toEqual([{status:'completed',locked_by:null,lease_until:null}]);
    expect((await c.query(`SELECT a.code FROM ledger_journals j JOIN ledger_entries e ON e.journal_id=j.id JOIN ledger_accounts a ON a.id=e.account_id WHERE j.idempotency_key=$1 AND e.side='debit'`,['refund:payme:'+tx])).rows).toEqual([{code:'refunds_payable'}]);
   });
   await recovery.reconcileTenant(actor.organizationId);
   await db.withActor(actor,async c=>expect((await c.query('SELECT count(*)::int n FROM payment_refund_requests WHERE payment_intent_id=$1',[f.intent])).rows[0].n).toBe(1));
  }
 });
 it('does not overwrite a callback completed during the worker network call, for success or timeout',async()=>{
  for(const fail of [false,true]){
   const f=await fixture();await service.cancel(actor,f.reservation,randomUUID());
   const providers=new PaymentProviderRegistry();
   providers.register({provider:'payme',refund:async(request:{paymentIntentId:string})=>{
    if(request.paymentIntentId!==f.intent)return {externalRefundId:randomUUID(),status:'pending'};
    const tx=await event(f.intent,'refunded',10000n,f.capture!);
    if(fail)throw Error('SYNTHETIC_RESPONSE_LOST');
    return {externalRefundId:tx,status:'refunded'};
   }} as unknown as PaymentProviderPort);
   expect((await new PaymentRefundWorkerService(db,providers,recovery).processTenantBatch(actor.organizationId,100)).superseded).toBeGreaterThanOrEqual(1);
   await db.withActor(actor,async c=>{
    expect((await c.query('SELECT status,locked_by,lease_until,last_error FROM payment_refund_requests WHERE payment_intent_id=$1',[f.intent])).rows).toEqual([{status:'completed',locked_by:null,lease_until:null,last_error:null}]);
    expect((await c.query('SELECT refunded_minor::text FROM payment_intents WHERE id=$1',[f.intent])).rows[0].refunded_minor).toBe('10000');
   });
  }
 });
 it('preserves the capture correlation when a verified callback identifies only the acknowledged refund',async()=>{
  const f=await fixture();await service.cancel(actor,f.reservation,randomUUID());const tx=randomUUID();
  await db.withActor(actor,c=>c.query("UPDATE payment_refund_requests SET status='uncertain',external_refund_id=$1 WHERE payment_intent_id=$2",[tx,f.intent]));
  const payload={organizationId:actor.organizationId,paymentIntentId:f.intent,externalEventId:randomUUID(),externalTransactionId:tx,eventType:'refunded' as const,amountMinor:10000n,currency:'UZS',occurredAt:new Date().toISOString(),rawMetadata:{synthetic:true}};
  expect((await webhooks.processVerified('payme',payload,JSON.stringify({synthetic:tx}))).status).toBe('partially_refunded');
  expect((await webhooks.processVerified('payme',payload,JSON.stringify({synthetic:tx}))).status).toBe('duplicate');
  await db.withOrganization(actor.organizationId,c=>recovery.ensureRefundsForIntent(c,{organizationId:actor.organizationId,paymentIntentId:f.intent,provider:'payme',currency:'UZS',reservationId:f.reservation}));
  await db.withActor(actor,async c=>{
   expect((await c.query("SELECT related_external_transaction_id FROM provider_transactions WHERE external_transaction_id=$1 AND kind='refund'",[tx])).rows[0].related_external_transaction_id).toBe(f.capture);
   expect((await c.query('SELECT status FROM payment_refund_requests WHERE payment_intent_id=$1',[f.intent])).rows).toEqual([{status:'completed'}]);
  });
 });
 it('rolls back mismatched or ambiguous refund confirmation rather than guessing a liability account',async()=>{
  const f=await fixture();await service.cancel(actor,f.reservation,randomUUID());
  await expect(event(f.intent,'refunded',9999n,f.capture!)).rejects.toThrow('REFUND_RECONCILIATION_MISMATCH');
  await db.withActor(actor,c=>c.query("UPDATE payment_refund_requests SET external_refund_id='synthetic-acknowledged-id',status='submitted' WHERE payment_intent_id=$1",[f.intent]));
  await expect(event(f.intent,'refunded',10000n,f.capture!)).rejects.toThrow('REFUND_RECONCILIATION_MISMATCH');
  await db.withActor(actor,c=>c.query(`INSERT INTO payment_refund_requests(organization_id,payment_intent_id,provider,amount_minor,currency,reason,idempotency_key,external_capture_id) VALUES($1,$2,'payme',10000,'UZS','synthetic-ambiguous',$3,$4)`,[actor.organizationId,f.intent,randomUUID(),f.capture]));
  await expect(event(f.intent,'refunded',10000n,f.capture!)).rejects.toThrow('REFUND_RECONCILIATION_AMBIGUOUS');
  await db.withActor(actor,async c=>{
   expect((await c.query("SELECT count(*)::int n FROM provider_transactions WHERE payment_intent_id=$1 AND kind='refund'",[f.intent])).rows[0].n).toBe(0);
   expect((await c.query('SELECT refunded_minor::text FROM payment_intents WHERE id=$1',[f.intent])).rows[0].refunded_minor).toBe('0');
  });
 });
 it('rolls back cancellation, inventory, refund queue and ledger if audit fails',async()=>{
  const f=await fixture();
  const brokenDb={withActor:(a:typeof actor,work:Parameters<DatabaseService['withActor']>[1])=>db.withActor(a,c=>work(new Proxy(c,{get(target,key){if(key==='query')return(sql:string,args:unknown[])=>{if(sql.startsWith('INSERT INTO audit_log'))throw Error('INJECTED_AUDIT_FAILURE');return target.query(sql,args);};return Reflect.get(target,key);}})))} as DatabaseService;
  await expect(new BookingCancellationService(brokenDb,recovery).cancel(actor,f.reservation,randomUUID())).rejects.toThrow('INJECTED_AUDIT_FAILURE');
  await db.withActor(actor,async c=>{
   expect((await c.query('SELECT status FROM reservations WHERE id=$1',[f.reservation])).rows[0].status).toBe('confirmed');
   expect((await c.query('SELECT count(*)::int n FROM inventory_periods WHERE reservation_id=$1',[f.reservation])).rows[0].n).toBe(1);
   expect((await c.query('SELECT count(*)::int n FROM payment_refund_requests WHERE payment_intent_id=$1',[f.intent])).rows[0].n).toBe(0);
   expect((await c.query("SELECT count(*)::int n FROM ledger_journals WHERE reference_id=$1 AND idempotency_key LIKE 'refund-reclassify:%'",[f.intent])).rows[0].n).toBe(0);
  });
 });
});
