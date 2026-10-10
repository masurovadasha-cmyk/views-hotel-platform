import {afterAll,afterEach,beforeAll,beforeEach,describe,expect,it,vi} from 'vitest';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {DatabaseService} from '../database/database.service';
import {GuestEmailService} from './guest-email.service';
import {GuestEmailRegistry,type GuestEmailMessage} from './guest-email.registry';
import {SecurityRateLimitService} from '../security/rate-limit.service';
import {GuestCancellationService} from './guest-cancellation.service';
import {QuoteService} from '../rates/quote.service';
import {BookingHoldService} from '../booking/booking-hold.service';
import {BookingLifecycleService} from '../booking/booking-lifecycle.service';
import {LedgerService} from '../payments/ledger.service';
import {PaymentRecoveryService} from '../payments/payment-recovery.service';
import {PaymentWebhookService} from '../payments/payment-webhook.service';
import {PaymentProviderRegistry} from '../payments/payment-provider.registry';
const db=new DatabaseService(),registry=new GuestEmailRegistry(),messages:GuestEmailMessage[]=[];
registry.register({send:async m=>{messages.push(m);return {accepted:true};}});
const auth=new GuestEmailService(db,registry,new SecurityRateLimitService(db)),ledger=new LedgerService(),recovery=new PaymentRecoveryService(db,ledger),service=new GuestCancellationService(db,auth,recovery,new SecurityRateLimitService(db)),webhooks=new PaymentWebhookService(db,new PaymentProviderRegistry(),ledger,recovery);
const org='00000000-0000-0000-0000-000000000001',property='00000000-0000-0000-0000-000000000002',type='00000000-0000-0000-0000-000000000003';
const actor={organizationId:org,userId:'20000000-0000-4000-8000-000000000001',membershipId:'30000000-0000-4000-8000-000000000001',requestId:randomUUID()};
const query=(sql:string,params:unknown[]=[])=>db.withOrganization(org,c=>c.query(sql,params));
async function account(){const link=await auth.requestLink('cancel-'+randomUUID()+'@views.invalid','en',randomBytes(32).toString('hex'));return auth.exchange(link.challengeId,messages.find(m=>m.challengeId===link.challengeId)!.token,randomBytes(32).toString('hex'));}
async function capture(intent:string,amount:bigint){const tx=randomUUID();await webhooks.processVerified('payme',{organizationId:org,paymentIntentId:intent,externalEventId:randomUUID(),externalTransactionId:tx,eventType:'captured',amountMinor:amount,currency:'UZS',occurredAt:new Date().toISOString(),rawMetadata:{synthetic:true}},JSON.stringify({synthetic:tx}));return tx;}
async function fixture(paidBps=8000){
 const user=await account(),profile=randomUUID(),unit=randomUUID(),rate=randomUUID(),policy=randomUUID(),intent=randomUUID();
 await db.withActor(actor,async c=>{
  await c.query("INSERT INTO guest_profiles(id,organization_id,user_id,first_name,last_name) VALUES($1,$2,$3,'Synthetic','Cancellation')",[profile,org,user.userId]);
  await c.query('INSERT INTO units(id,property_id,unit_type_id,code) VALUES($1,$2,$3,$1::uuid::text)',[unit,property,type]);
  await c.query(`INSERT INTO cancellation_policy_templates(id,organization_id,code,name,rules) VALUES($1,$2,$1::uuid::text,'{"en":"Synthetic"}','{"version":1,"rules":[{"minHoursBeforeCheckIn":0,"refundBps":5000}],"nonRefundableLineCodes":[]}')`,[policy,org]);
  await c.query(`INSERT INTO rate_plans(id,property_id,unit_type_id,name,currency,base_nightly_minor,cancellation_policy_id) VALUES($1,$2,$3,'{"en":"Synthetic"}','UZS',10000,$4)`,[rate,property,type,policy]);
 });
 const quote=await new QuoteService(db).createQuote({actor,propertyId:property,unitId:unit,ratePlanId:rate,checkInAt:'2037-06-01T14:00+05:00',checkOutAt:'2037-06-03T12:00+05:00',guests:[{age:30,residency:'resident'}]});
 const hold=await new BookingHoldService(db).createHold({actor,quoteId:quote.quoteId,idempotencyKey:randomUUID(),ttlSeconds:300});
 await query('UPDATE reservations SET primary_guest_id=$1 WHERE id=$2',[profile,hold.reservationId]);
 await query("INSERT INTO payment_intents(id,organization_id,reservation_id,quote_id,provider,amount_minor,currency,idempotency_key) VALUES($1,$2,$3,$4,'payme',$5,'UZS',$1::uuid::text)",[intent,org,hold.reservationId,quote.quoteId,quote.totalMinor.toString()]);
 const paid=quote.totalMinor*BigInt(paidBps)/10000n;if(paid)await capture(intent,paid);
 if(paidBps<10000)await new BookingLifecycleService(db).confirmHold(actor,hold.reservationId,randomUUID());
 return {user,profile,id:hold.reservationId,intent,total:quote.totalMinor,paid};
}
beforeAll(async()=>expect((await db.query("SELECT shobj_description((SELECT oid FROM pg_database WHERE datname=current_database()),'pg_database') marker")).rows[0].marker).toBe('VIEWS_DISPOSABLE_CORE_TEST'));
beforeEach(()=>{for(const [k,v] of Object.entries({NODE_ENV:'test',VIEWS_LOCAL_REHEARSAL:'true',VIEWS_GUEST_EMAIL_PILOT_ENABLED:'true',VIEWS_GUEST_CANCELLATION_PILOT_ENABLED:'true',VIEWS_GUEST_EMAIL_TOKEN_KEY:'ef'.repeat(32)}))vi.stubEnv(k,v);});
afterEach(()=>vi.unstubAllEnvs());afterAll(()=>db.onModuleDestroy());
describe.sequential('guest cancellation / actual PostgreSQL',()=>{
 it('uses frozen policy and actual collected money; atomically queues refund without claiming payment',async()=>{
  const f=await fixture(),preview=await service.preview(f.user.token,f.id),penalty=f.total-10000n;
  expect(preview.penaltyMinor).toBe(penalty.toString());expect(preview.refundMinor).toBe((f.paid-penalty).toString());expect(preview.refundStatus).toBe('pending');
  const key=randomUUID(),receipt=await service.confirm(f.user.token,f.id,preview.quoteId,key);
  expect(receipt).toMatchObject({refundMinor:preview.refundMinor,status:'cancelled',refundStatus:'pending',idempotentReplay:false});
  expect(await service.confirm(f.user.token,f.id,preview.quoteId,key)).toEqual({...receipt,idempotentReplay:true});
  expect((await query('SELECT actor_kind,actor_membership_id FROM booking_cancellations WHERE reservation_id=$1',[f.id])).rows).toEqual([{actor_kind:'guest',actor_membership_id:null}]);
  expect((await query('SELECT amount_minor::text,status FROM payment_refund_requests WHERE payment_intent_id=$1',[f.intent])).rows).toEqual([{amount_minor:preview.refundMinor,status:'pending'}]);
  expect((await query('SELECT * FROM inventory_periods WHERE reservation_id=$1',[f.id])).rows).toEqual([]);
  await capture(f.intent,f.total-f.paid);
  expect((await query('SELECT amount_minor::text FROM payment_refund_requests WHERE payment_intent_id=$1',[f.intent])).rows.map(x=>x.amount_minor).sort()).toEqual([preview.refundMinor,(f.total-f.paid).toString()].sort());
 });
 it('serializes parallel lost-response retries and rejects changed quote/key payloads',async()=>{
  const f=await fixture(),preview=await service.preview(f.user.token,f.id),another=await service.preview(f.user.token,f.id),key=randomUUID();
  const results=await Promise.all(Array.from({length:4},()=>service.confirm(f.user.token,f.id,preview.quoteId,key)));
  expect(results.filter(x=>!x.idempotentReplay)).toHaveLength(1);
  await expect(service.confirm(f.user.token,f.id,another.quoteId,key)).rejects.toThrow('GUEST_CANCELLATION_COMMAND_CONFLICT');
  expect((await query("SELECT count(*)::int n FROM audit_log WHERE entity_id=$1 AND action='guest.booking_cancelled'",[f.id])).rows[0].n).toBe(1);
  expect((await query("SELECT count(*)::int n FROM outbox_events WHERE aggregate_id=$1 AND idempotency_key LIKE 'guest-policy-cancel:%'",[f.id])).rows[0].n).toBe(1);
 });
 it('rejects changed finances, policy, inventory and missing ownership before mutation or replay',async()=>{
  const f=await fixture(),preview=await service.preview(f.user.token,f.id);
  await capture(f.intent,1n);await expect(service.confirm(f.user.token,f.id,preview.quoteId,randomUUID())).rejects.toThrow('GUEST_CANCELLATION_QUOTE_STALE');
  const next=await service.preview(f.user.token,f.id);
  await query("UPDATE reservations SET cancellation_policy_snapshot=jsonb_set(cancellation_policy_snapshot,'{rules,0,refundBps}','2500') WHERE id=$1",[f.id]);
  await expect(service.confirm(f.user.token,f.id,next.quoteId,randomUUID())).rejects.toThrow('GUEST_CANCELLATION_QUOTE_STALE');
  const fresh=await service.preview(f.user.token,f.id),key=randomUUID();await query('UPDATE guest_profiles SET user_id=NULL WHERE id=$1',[f.profile]);
  await expect(service.confirm(f.user.token,f.id,fresh.quoteId,key)).rejects.toThrow('GUEST_TRIP_NOT_FOUND');
  await query('UPDATE guest_profiles SET user_id=$1 WHERE id=$2',[f.user.userId,f.profile]);await service.confirm(f.user.token,f.id,fresh.quoteId,key);
  await query('UPDATE guest_profiles SET user_id=NULL WHERE id=$1',[f.profile]);await expect(service.confirm(f.user.token,f.id,fresh.quoteId,key)).rejects.toThrow('GUEST_TRIP_NOT_FOUND');
  await expect(service.preview((await account()).token,f.id)).rejects.toThrow('GUEST_TRIP_NOT_FOUND');
 });
 it('expires quotes at a policy threshold and denies invalid policy instead of defaulting to free cancellation',async()=>{
  const f=await fixture(0),hours=(Date.parse('2037-06-01T09:00:00Z')-Date.now()-1500)/3600000;
  await query("UPDATE reservations SET cancellation_policy_snapshot=jsonb_set(cancellation_policy_snapshot,'{rules}',$1::jsonb) WHERE id=$2",[JSON.stringify([{minHoursBeforeCheckIn:hours,refundBps:10000},{minHoursBeforeCheckIn:0,refundBps:0}]),f.id]);
  const p=await service.preview(f.user.token,f.id);expect(p.refundBps).toBe(10000);await new Promise(r=>setTimeout(r,1600));
  await expect(service.confirm(f.user.token,f.id,p.quoteId,randomUUID())).rejects.toThrow('GUEST_CANCELLATION_QUOTE_STALE');
  await query("UPDATE reservations SET cancellation_policy_snapshot='{}' WHERE id=$1",[f.id]);await expect(service.preview(f.user.token,f.id)).rejects.toThrow('GUEST_CANCELLATION_RECONCILIATION_REQUIRED');
 });
 it('rolls back reservation, receipt, inventory and audit if internal financial recovery fails',async()=>{
  const f=await fixture(),p=await service.preview(f.user.token,f.id),broken=new GuestCancellationService(db,auth,{ensureRefundsForIntent:async()=>{throw Error('SYNTHETIC_RECOVERY_FAILURE');}} as unknown as PaymentRecoveryService,new SecurityRateLimitService(db));
  await expect(broken.confirm(f.user.token,f.id,p.quoteId,randomUUID())).rejects.toThrow('SYNTHETIC_RECOVERY_FAILURE');
  expect((await query('SELECT status FROM reservations WHERE id=$1',[f.id])).rows[0].status).toBe('confirmed');
  expect((await query('SELECT * FROM booking_cancellations WHERE reservation_id=$1',[f.id])).rows).toHaveLength(0);
  expect((await query('SELECT * FROM inventory_periods WHERE reservation_id=$1',[f.id])).rows).toHaveLength(1);
  expect((await query("SELECT * FROM audit_log WHERE entity_id=$1 AND action='guest.booking_cancelled'",[f.id])).rows).toHaveLength(0);
 });
 it('independently rejects forged SQL calculations and a cancellation without atomic financial recovery',async()=>{
  const f=await fixture(),hash=createHash('sha256').update(f.user.token).digest('hex');
  const state=(await db.query('SELECT app.guest_cancellation_state($1,$2) s',[hash,f.id])).rows[0].s.fingerprint;
  await expect(db.query("SELECT app.guest_cancellation_quote($1,$2,$3,$4,clock_timestamp()+interval '1 minute')",[hash,f.id,state,{penaltyMinor:'0',refundMinor:f.paid.toString(),netCollectedMinor:f.paid.toString(),refundBps:10000,limits:[]}])).rejects.toMatchObject({code:'40001'});
  const p=await service.preview(f.user.token,f.id);
  const incomplete=new GuestCancellationService(db,auth,{ensureRefundsForIntent:async()=>({refundsQueued:0,reclassified:0})} as unknown as PaymentRecoveryService,new SecurityRateLimitService(db));
  await expect(incomplete.confirm(f.user.token,f.id,p.quoteId,randomUUID())).rejects.toThrow('GUEST_CANCELLATION_RECOVERY_REQUIRED');
  expect((await query('SELECT status FROM reservations WHERE id=$1',[f.id])).rows[0].status).toBe('confirmed');
 });
 it('accepts legitimate negative discounts but rejects mixed-currency price lines',async()=>{
  const f=await fixture(0);
  await query("INSERT INTO reservation_price_lines(reservation_id,line_type,label,amount_minor,currency,code,refundable) VALUES($1,'discount','{\"en\":\"Synthetic discount\"}',-2000,'UZS','discount',true)",[f.id]);
  await query('UPDATE reservations SET total_minor=total_minor-2000 WHERE id=$1',[f.id]);
  const p=await service.preview(f.user.token,f.id);expect(p.penaltyMinor).toBe((f.total-2000n-9000n).toString());
  await query("UPDATE reservation_price_lines SET currency='USD' WHERE reservation_id=$1 AND code='discount'",[f.id]);
  await expect(service.preview(f.user.token,f.id)).rejects.toThrow('GUEST_CANCELLATION_RECONCILIATION_REQUIRED');
 });
 it('keeps private data inaccessible, fails closed on existing refund and default-off/production gates',async()=>{
  const f=await fixture();await query("INSERT INTO payment_refund_requests(organization_id,payment_intent_id,provider,amount_minor,currency,reason,idempotency_key,external_capture_id) VALUES($1,$2,'payme',1,'UZS','synthetic',$3,'synthetic-existing-refund')",[org,f.intent,randomUUID()]);
  await expect(service.preview(f.user.token,f.id)).rejects.toThrow('GUEST_CANCELLATION_RECONCILIATION_REQUIRED');
  await expect(db.query('SELECT * FROM guest_identity_private.cancellation_quotes')).rejects.toMatchObject({code:'42501'});
  vi.stubEnv('VIEWS_GUEST_CANCELLATION_PILOT_ENABLED','false');await expect(service.preview(f.user.token,f.id)).rejects.toThrow('GUEST_CANCELLATION_DISABLED');
  vi.stubEnv('VIEWS_GUEST_CANCELLATION_PILOT_ENABLED','true');vi.stubEnv('NODE_ENV','production');await expect(service.preview(f.user.token,f.id)).rejects.toThrow('GUEST_CANCELLATION_DISABLED');
 });
});
