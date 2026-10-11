import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {randomUUID} from 'node:crypto';
import {DatabaseService} from '../database/database.service';
import {LedgerService} from './ledger.service';
const db=new DatabaseService(),ledger=new LedgerService(),org='00000000-0000-0000-0000-000000000001';
const reservation=randomUUID(),quote=randomUUID(),intent=randomUUID();
const input=()=>({organizationId:org,paymentIntentId:intent,amountMinor:9007199254740993n,currency:'UZS',idempotencyKey:randomUUID()});
beforeAll(async()=>db.withOrganization(org,async c=>{
 await c.query(`INSERT INTO reservations(id,organization_id,property_id,unit_id,confirmation_code,status,check_in_at,check_out_at,currency,cancellation_policy_snapshot) VALUES($1,$2,'00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000004',$1::uuid::text,'confirmed','2031-12-01','2031-12-02','UZS','{}')`,[reservation,org]);
 await c.query(`INSERT INTO booking_quotes(id,organization_id,property_id,unit_id,rate_plan_id,check_in_at,check_out_at,guest_context,currency,accommodation_minor,total_minor,cancellation_policy_snapshot,pricing_snapshot,input_hash,expires_at) VALUES($1,$2,'00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000008','2031-12-01','2031-12-02','{}','UZS',9007199254740993,9007199254740993,'{}','{}','synthetic-ledger',now()+interval '5 minutes')`,[quote,org]);
 await c.query(`INSERT INTO payment_intents(id,organization_id,reservation_id,quote_id,provider,amount_minor,currency,idempotency_key) VALUES($1,$2,$3,$4,'payme',9007199254740993,'UZS',$1::uuid::text)`,[intent,org,reservation,quote]);
}));
afterAll(()=>db.onModuleDestroy());
describe.sequential('B3 ledger identity and concurrent commands',()=>{
 it('replays exact content and refuses altered money, currency, reference or liability account',async()=>{
  const value=input(),journal=await db.withOrganization(org,c=>ledger.postCapture(c,value));
  expect(await db.withOrganization(org,c=>ledger.postCapture(c,value))).toBe(journal);
  for(const change of [{amountMinor:1n},{currency:'USD'},{paymentIntentId:randomUUID()}])await expect(db.withOrganization(org,c=>ledger.postCapture(c,{...value,...change}))).rejects.toThrow('LEDGER_IDEMPOTENCY_CONFLICT');
  await expect(db.withOrganization(org,c=>ledger.postLateCapture(c,value))).rejects.toThrow('LEDGER_IDEMPOTENCY_CONFLICT');
  await db.withOrganization(org,async c=>expect((await c.query("SELECT count(*)::int n,sum(CASE side WHEN 'debit' THEN amount_minor::numeric ELSE -amount_minor::numeric END)::text balance FROM ledger_entries WHERE journal_id=$1",[journal])).rows[0]).toEqual({n:2,balance:'0'}));
 });
 it('serializes simultaneous equal commands to a single posted journal',async()=>{
  const value=input(),ids=await Promise.all(Array.from({length:6},()=>db.withOrganization(org,c=>ledger.postCapture(c,value))));
  expect(new Set(ids).size).toBe(1);
  await db.withOrganization(org,async c=>expect((await c.query('SELECT count(*)::int n FROM ledger_journals WHERE organization_id=$1 AND idempotency_key=$2',[org,value.idempotencyKey])).rows[0].n).toBe(1));
 });
 it('has one winner for conflicting concurrent payloads',async()=>{
  const value=input(),race=await Promise.allSettled([1n,2n].map(amountMinor=>db.withOrganization(org,c=>ledger.postCapture(c,{...value,amountMinor}))));
  expect(race.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect((race.find(r=>r.status==='rejected') as PromiseRejectedResult).reason.message).toBe('LEDGER_IDEMPOTENCY_CONFLICT');
 });
 it('compares marketplace allocation, including a replay changed to zero',async()=>{
  const value={organizationId:org,snapshotId:randomUUID(),reservationId:randomUUID(),currency:'UZS',netCollectedMinor:100n,platformCommissionMinor:10n,ownerPayableMinor:80n,taxesWithheldMinor:5n,otherDeductionsMinor:5n,idempotencyKey:randomUUID()};
  await db.withOrganization(org,c=>c.query(`INSERT INTO reservation_economic_snapshots(id,organization_id,property_id,reservation_id,version,currency,net_collected_minor,platform_commission_minor,owner_payable_minor,taxes_withheld_minor,other_deductions_minor,source_kind,idempotency_key,request_hash,payment_state_hash,created_by_user_id,created_by_membership_id) VALUES($1,$2,'00000000-0000-0000-0000-000000000002',$3,1,'UZS',100,10,80,5,5,'manual',$4,$5,$5,'20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001')`,[value.snapshotId,org,reservation,value.idempotencyKey,'a'.repeat(64)]));
  const journal=await db.withOrganization(org,c=>ledger.postMarketplaceEconomics(c,value));
  expect(await db.withOrganization(org,c=>ledger.postMarketplaceEconomics(c,value))).toBe(journal);
  await expect(db.withOrganization(org,c=>ledger.postMarketplaceEconomics(c,{...value,platformCommissionMinor:20n,ownerPayableMinor:70n}))).rejects.toThrow('LEDGER_IDEMPOTENCY_CONFLICT');
  await expect(db.withOrganization(org,c=>ledger.postMarketplaceEconomics(c,{...value,netCollectedMinor:0n,platformCommissionMinor:0n,ownerPayableMinor:0n,taxesWithheldMinor:0n,otherDeductionsMinor:0n}))).rejects.toThrow('LEDGER_IDEMPOTENCY_CONFLICT');
 });
 it('refuses a draft journal under an already used key',async()=>{
  const value=input();await db.withOrganization(org,c=>c.query("INSERT INTO ledger_journals(organization_id,reference_type,reference_id,idempotency_key,description) VALUES($1,'payment_intent',$2,$3,'Synthetic unfinished journal')",[org,value.paymentIntentId,value.idempotencyKey]));
  await expect(db.withOrganization(org,c=>ledger.postCapture(c,value))).rejects.toThrow('LEDGER_IDEMPOTENCY_CONFLICT');
 });
 it('rejects inserting into a posted journal or moving its entry to a draft',async()=>{
  const value=input(),posted=await db.withOrganization(org,c=>ledger.postCapture(c,value)),draft=randomUUID();
  const entry=await db.withOrganization(org,async c=>{
   await c.query("INSERT INTO ledger_journals(id,organization_id,reference_type,reference_id,idempotency_key,description) VALUES($1,$2,'payment_intent',$3,$4,'Synthetic draft')",[draft,org,intent,randomUUID()]);
   return (await c.query('SELECT id,account_id FROM ledger_entries WHERE journal_id=$1 LIMIT 1',[posted])).rows[0];
  });
  await expect(db.withOrganization(org,c=>c.query("INSERT INTO ledger_entries(journal_id,account_id,side,amount_minor,currency) VALUES($1,$2,'debit',1,'UZS')",[posted,entry.account_id]))).rejects.toThrow('posted ledger entries are immutable');
  await expect(db.withOrganization(org,c=>c.query('UPDATE ledger_entries SET journal_id=$1 WHERE id=$2',[draft,entry.id]))).rejects.toThrow('posted ledger entries are immutable');
  await expect(db.withOrganization(org,c=>c.query('DELETE FROM ledger_entries WHERE id=$1',[entry.id]))).rejects.toThrow('posted ledger entries are immutable');
 });
 it('rejects an account currency mismatch and identity rewrites',async()=>{
  const draft=randomUUID(),account=await db.withOrganization(org,c=>ledger.ensureAccount(c,org,'provider_clearing','UZS'));
  await db.withOrganization(org,c=>c.query("INSERT INTO ledger_journals(id,organization_id,reference_type,reference_id,idempotency_key,description) VALUES($1,$2,'payment_intent',$3,$4,'Synthetic currency test')",[draft,org,intent,randomUUID()]));
  await expect(db.withOrganization(org,c=>c.query("INSERT INTO ledger_entries(journal_id,account_id,side,amount_minor,currency) VALUES($1,$2,'debit',1,'USD')",[draft,account]))).rejects.toThrow('LEDGER_ACCOUNT_SCOPE_OR_CURRENCY_MISMATCH');
  await expect(db.withOrganization(org,c=>c.query("UPDATE ledger_accounts SET currency='USD' WHERE id=$1",[account]))).rejects.toThrow('LEDGER_ACCOUNT_IDENTITY_IMMUTABLE');
  const foreign='10000000-0000-4000-8000-000000000001',foreignAccount=await db.withOrganization(foreign,c=>ledger.ensureAccount(c,foreign,'provider_clearing','UZS'));
  await expect(db.withOrganization(org,c=>c.query("INSERT INTO ledger_entries(journal_id,account_id,side,amount_minor,currency) VALUES($1,$2,'debit',1,'UZS')",[draft,foreignAccount]))).rejects.toThrow('LEDGER_ACCOUNT_SCOPE_OR_CURRENCY_MISMATCH');
 });
 it('serializes posting with an attempted concurrent appended entry',async()=>{
  const draft=randomUUID(),accounts=await db.withOrganization(org,async c=>{
   const debit=await ledger.ensureAccount(c,org,'provider_clearing','UZS'),credit=await ledger.ensureAccount(c,org,'guest_deposits','UZS');
   await c.query("INSERT INTO ledger_journals(id,organization_id,reference_type,reference_id,idempotency_key,description) VALUES($1,$2,'payment_intent',$3,$4,'Synthetic post race')",[draft,org,intent,randomUUID()]);
   await c.query("INSERT INTO ledger_entries(journal_id,account_id,side,amount_minor,currency) VALUES($1,$2,'debit',100,'UZS'),($1,$3,'credit',100,'UZS')",[draft,debit,credit]);return {debit,credit};
  });
  let reached!:()=>void,release!:()=>void;const locked=new Promise<void>(r=>{reached=r;}),gate=new Promise<void>(r=>{release=r;});
  const posting=db.withOrganization(org,async c=>{await c.query('SELECT id FROM ledger_journals WHERE id=$1 FOR UPDATE',[draft]);reached();await gate;await c.query("UPDATE ledger_journals SET status='posted',posted_at=now() WHERE id=$1",[draft]);});
  await locked;
  const appending=db.withOrganization(org,c=>c.query("INSERT INTO ledger_entries(journal_id,account_id,side,amount_minor,currency) VALUES($1,$2,'debit',1,'UZS')",[draft,accounts.debit]));
  try{
   let blocked=false;for(let i=0;i<100;i++){if((await db.query("SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE 'INSERT INTO ledger_entries%'")).rowCount){blocked=true;break;}await new Promise(r=>setTimeout(r,10));}
   expect(blocked).toBe(true);
  }finally{release();}
  const results=await Promise.allSettled([posting,appending]);expect(results[0].status).toBe('fulfilled');expect((results[1] as PromiseRejectedResult).reason.message).toBe('posted ledger entries are immutable');
 });
 it('posts opposite operations concurrently without changing existing account metadata',async()=>{
  const seed=input();await db.withOrganization(org,c=>ledger.postCapture(c,seed));
  const before=await db.withOrganization(org,c=>c.query("SELECT id,name,account_type FROM ledger_accounts WHERE organization_id=$1 AND currency='UZS' AND code IN ('provider_clearing','guest_deposits') ORDER BY id",[org]));
  await Promise.all(Array.from({length:8},(_,n)=>db.withOrganization(org,c=>n%2?ledger.postRefund(c,input()):ledger.postCapture(c,input()))));
  const after=await db.withOrganization(org,c=>c.query("SELECT id,name,account_type FROM ledger_accounts WHERE organization_id=$1 AND currency='UZS' AND code IN ('provider_clearing','guest_deposits') ORDER BY id",[org]));
  expect(after.rows).toEqual(before.rows);
 });
});
