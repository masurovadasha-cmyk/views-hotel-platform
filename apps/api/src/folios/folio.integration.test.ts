import {afterAll,afterEach,beforeAll,beforeEach,describe,expect,it,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {DatabaseService} from '../database/database.service';
import {FolioService} from './folio.service';
import {NightAuditService} from './night-audit.service';
import type {RequestActorContext} from '../identity/actor-context';
const db=new DatabaseService(),folios=new FolioService(db),audit=new NightAuditService(db);
const org='00000000-0000-0000-0000-000000000001',baseProperty='00000000-0000-0000-0000-000000000002';
const manager={organizationId:org,userId:'20000000-0000-4000-8000-000000000001',membershipId:'30000000-0000-4000-8000-000000000001',requestId:randomUUID()};
const reader={...manager,userId:'20000000-0000-4000-8000-000000000002',membershipId:'30000000-0000-4000-8000-000000000002'};
const run=(sql:string,p:unknown[]=[],actor:RequestActorContext=manager)=>db.withActor(actor,c=>c.query(sql,p));
async function property(){const p=randomUUID();await run("INSERT INTO properties(id,organization_id,name,city,address,country_code,timezone) SELECT $1,organization_id,'{\"en\":\"Synthetic folio\"}',city,address,country_code,timezone FROM properties WHERE id=$2",[p,baseProperty]);return p;}
async function stay(p:string,status='checked_out',amount='200',discount='1',dates=['2020-06-01','2020-06-02']){
 const id=randomUUID(),unit=randomUUID(),type=randomUUID();await run("INSERT INTO unit_types(id,property_id,name,max_guests) VALUES($1,$2,'{\"en\":\"Synthetic\"}',2)",[type,p]);await run('INSERT INTO units(id,property_id,unit_type_id,code) VALUES($1,$2,$3,$1::uuid::text)',[unit,p,type]);await run(`INSERT INTO reservations(id,organization_id,property_id,unit_id,confirmation_code,status,check_in_at,check_out_at,currency,total_minor,cancellation_policy_snapshot,quote_snapshot) VALUES($1,$2,$3,$9,$1::uuid::text,$4,$5::date+time '14:00',$6::date+time '12:00','UZS',$7,'{}',$8)`,[id,org,p,status,dates[0],new Date(Date.parse(dates.at(-1)!+'T00:00Z')+86400000).toISOString().slice(0,10),(BigInt(amount)*BigInt(dates.length)-BigInt(discount)).toString(),{pricingSnapshot:{propertyTimezone:'Asia/Tashkent',nightlyDates:dates}},unit]);
 await run("INSERT INTO inventory_periods(organization_id,property_id,unit_id,kind,reservation_id,stay_period) SELECT organization_id,property_id,unit_id,'reservation',id,tstzrange(check_in_at,check_out_at,'[)') FROM reservations WHERE id=$1",[id]);
 for(const date of dates)await run(`INSERT INTO reservation_price_lines(reservation_id,line_type,code,label,amount_minor,currency,refundable,metadata) VALUES($1,'night',$2,'{"en":"Synthetic night"}',$3,'UZS',true,$4)`,[id,'night:'+date,amount,{stayDate:date}]);
 if(discount!=='0')await run(`INSERT INTO reservation_price_lines(reservation_id,line_type,code,label,amount_minor,currency,refundable,metadata) VALUES($1,'discount','synthetic-discount','{"en":"Synthetic discount"}',$2,'UZS',true,'{}')`,[id,(-BigInt(discount)).toString()]);return id;
}
async function execute(p:string,date='2020-06-01',key=randomUUID()){const preview=await audit.inspect(manager,p,date);return audit.run(manager,key,{propertyId:p,businessDate:date,expectedRevision:preview.revision});}
beforeAll(async()=>expect((await db.query("SELECT shobj_description((SELECT oid FROM pg_database WHERE datname=current_database()),'pg_database') marker")).rows[0].marker).toBe('VIEWS_DISPOSABLE_CORE_TEST'));
beforeEach(()=>{vi.stubEnv('NODE_ENV','test');vi.stubEnv('VIEWS_LOCAL_REHEARSAL','true');vi.stubEnv('VIEWS_FOLIO_PILOT_ENABLED','true');});afterEach(()=>vi.unstubAllEnvs());afterAll(()=>db.onModuleDestroy());
describe.sequential('operational folios and manual night audit / PostgreSQL',()=>{
 it('opens folio with exact charge; immutable reversal restores balance and replay compares payload',async()=>{
  const p=await property(),r=await stay(p),key=randomUUID(),body={kind:'service',amountMinor:'9007199254740993',label:'Synthetic service'};
  expect((await folios.list(manager,p)).items.find(x=>x.reservationId===r)?.id).toBeNull();
  const receipt=await folios.charge(manager,r,key,body);expect(await folios.charge(manager,r,key,body)).toEqual({...receipt,idempotentReplay:true});
  await expect(folios.charge(manager,r,key,{...body,amountMinor:'1'})).rejects.toThrow('FOLIO_COMMAND_CONFLICT');
  expect((await folios.detail(manager,r)).folio.balanceMinor).toBe(body.amountMinor);
  await folios.reverse(manager,r,randomUUID(),{entryId:receipt.entryId,reason:'Synthetic correction'});
  const detail=await folios.detail(manager,r);expect(detail.folio.balanceMinor).toBe('0');expect(detail.items.find(x=>x.id===receipt.entryId)?.reversed).toBe(true);
  await expect(folios.reverse(manager,r,randomUUID(),{entryId:receipt.entryId,reason:'Again'})).rejects.toThrow('FOLIO_ALREADY_REVERSED');
  expect((await run('UPDATE folio_entries SET amount_minor=1 WHERE id=$1',[receipt.entryId])).rowCount).toBe(0);
  expect((await run('SELECT * FROM ledger_journals WHERE reference_id=$1',[receipt.folioId])).rowCount).toBe(0);
 });
 it('posts discounted frozen nights exactly once without taxes, payment or revenue recognition',async()=>{
  const p=await property(),r=await stay(p);const first=await execute(p);expect(first).toMatchObject({reservationCount:1,postedCount:1,totals:[{currency:'UZS',amountMinor:'200'}]});
  expect((await execute(p)).idempotentReplay).toBe(true);
  expect((await execute(p,'2020-06-02')).totals).toEqual([{currency:'UZS',amountMinor:'199'}]);
  const f=await folios.detail(manager,r);expect(f.folio.balanceMinor).toBe('399');expect(f.items.map(x=>x.businessDate).sort()).toEqual(['2020-06-01','2020-06-02']);expect(f.items.every(x=>x.kind==='accommodation'&&x.sourceType==='night_audit')).toBe(true);
  expect((await run("SELECT count(*)::int n FROM outbox_events WHERE aggregate_id=$1 AND event_type='folio.night_audit_posted'",[first.runId])).rows[0].n).toBe(1);
 });
 it('rejects stale explicit preview, unresolved arrivals and snapshot drift between nights',async()=>{
  const p=await property(),r=await stay(p),preview=await audit.inspect(manager,p,'2020-06-01');
  await run("UPDATE reservation_price_lines SET amount_minor=amount_minor+1 WHERE reservation_id=$1 AND code='night:2020-06-01'",[r]);
  await expect(audit.run(manager,randomUUID(),{propertyId:p,businessDate:'2020-06-01',expectedRevision:preview.revision})).rejects.toThrow('NIGHT_AUDIT_STALE');
  await run("UPDATE reservation_price_lines SET amount_minor=amount_minor-1 WHERE reservation_id=$1 AND code='night:2020-06-01'",[r]);await execute(p);
  await run("UPDATE reservation_price_lines SET amount_minor=amount_minor+1 WHERE reservation_id=$1 AND code='night:2020-06-02'",[r]);await run('UPDATE reservations SET total_minor=total_minor+1 WHERE id=$1',[r]);
  await expect(execute(p,'2020-06-02')).rejects.toThrow('NIGHT_AUDIT_RECONCILIATION_REQUIRED');expect((await folios.detail(manager,r)).folio.balanceMinor).toBe('200');
  const blocked=await property();await stay(blocked,'confirmed');expect((await audit.inspect(manager,blocked,'2020-06-01')).unresolvedCount).toBe(1);await expect(execute(blocked)).rejects.toThrow('NIGHT_AUDIT_UNRESOLVED_ARRIVALS');
 });
 it('blocks unoccupied nights after early checkout but accepts ordinary checkout state changes',async()=>{
  const p=await property(),r=await stay(p,'checked_in');await execute(p);
  await run("UPDATE reservations SET status='checked_out' WHERE id=$1",[r]);expect((await audit.inspect(manager,p,'2020-06-01')).scopeChanged).toBe(false);
  await run("UPDATE inventory_periods SET stay_period=tstzrange(lower(stay_period),'2020-06-02 10:00+05','[)') WHERE reservation_id=$1",[r]);
  await expect(execute(p,'2020-06-02')).rejects.toThrow('NIGHT_AUDIT_RECONCILIATION_REQUIRED');expect((await folios.detail(manager,r)).folio.entryCount).toBe(1);
 });
 it('marks changed completed cohort for reconciliation and rejects current property business date',async()=>{
  const p=await property();await execute(p);await stay(p);
  const changed=await audit.inspect(manager,p,'2020-06-01');expect(changed.scopeChanged).toBe(true);await expect(execute(p)).rejects.toThrow('NIGHT_AUDIT_RECONCILIATION_REQUIRED');
  const date=(await run("SELECT (clock_timestamp() AT TIME ZONE 'Asia/Tashkent')::date::text date")).rows[0].date;await expect(audit.inspect(manager,p,date)).rejects.toThrow('NIGHT_AUDIT_DATE_NOT_CLOSED');
 });
 it('serializes parallel audit commands and validates payload on lost-response retries',async()=>{
  const p=await property();await stay(p);const q=await audit.inspect(manager,p,'2020-06-01'),key=randomUUID(),body={propertyId:p,businessDate:'2020-06-01',expectedRevision:q.revision};
  const results=await Promise.all(Array.from({length:4},()=>audit.run(manager,key,body)));expect(results.filter(r=>!r.idempotentReplay)).toHaveLength(1);
  await expect(audit.run(manager,key,{...body,businessDate:'2020-06-02'})).rejects.toThrow('FOLIO_COMMAND_CONFLICT');
  expect((await run('SELECT count(*)::int n FROM folio_night_audits WHERE property_id=$1',[p])).rows[0].n).toBe(1);
 });
 it('rolls back full batch when a later folio is closed; disallows direct registry rewrites and forged actor',async()=>{
  const p=await property(),one=await stay(p),two=await stay(p),charge=await folios.charge(manager,two,randomUUID(),{kind:'fee',amountMinor:'1',label:'Synthetic'});
  await run("UPDATE guest_folios SET status='closed',closed_at=now() WHERE id=$1",[charge.folioId]);await expect(execute(p)).rejects.toThrow('FOLIO_NOT_OPEN');
  expect((await folios.detail(manager,one)).folio.entryCount).toBe(0);expect((await run('SELECT * FROM folio_night_audits WHERE property_id=$1',[p])).rows).toHaveLength(0);
  await expect(folios.charge(manager,two,randomUUID(),{kind:'fee',amountMinor:'1',label:'Again'})).rejects.toThrow('FOLIO_NOT_OPEN');
  await expect(folios.list({...manager,userId:reader.userId},p)).rejects.toThrow('PROPERTY_FORBIDDEN');
  await expect(folios.detail({...manager,organizationId:'10000000-0000-4000-8000-000000000001'},one)).rejects.toThrow('FOLIO_NOT_FOUND');
 });
 it('processes all 500 stays and reads them through bounded pages; no silent 100-row cutoff',async()=>{
  const p=await property(),type=randomUUID();await db.withActor(manager,async c=>{
   await c.query("INSERT INTO unit_types(id,property_id,name,max_guests) VALUES($1,$2,'{\"en\":\"Synthetic500\"}',2)",[type,p]);
   await c.query("INSERT INTO units(id,property_id,unit_type_id,code) SELECT gen_random_uuid(),$1,$2,'S'||n::text FROM generate_series(1,500) n",[p,type]);
   await c.query(`INSERT INTO reservations(id,organization_id,property_id,unit_id,confirmation_code,status,check_in_at,check_out_at,currency,total_minor,cancellation_policy_snapshot,quote_snapshot)
    SELECT gen_random_uuid(),$1,$2,u.id,u.id::text,'checked_out','2020-07-01 14:00+05','2020-07-02 12:00+05','UZS',1,'{}','{"pricingSnapshot":{"propertyTimezone":"Asia/Tashkent","nightlyDates":["2020-07-01"]}}' FROM units u WHERE u.property_id=$2`,[org,p]);
   await c.query("INSERT INTO inventory_periods(organization_id,property_id,unit_id,kind,reservation_id,stay_period) SELECT organization_id,property_id,unit_id,'reservation',id,tstzrange(check_in_at,check_out_at,'[)') FROM reservations WHERE property_id=$1",[p]);
   await c.query(`INSERT INTO reservation_price_lines(reservation_id,line_type,code,label,amount_minor,currency,refundable,metadata) SELECT id,'night','night:2020-07-01','{"en":"Synthetic"}',1,'UZS',true,'{"stayDate":"2020-07-01"}' FROM reservations WHERE property_id=$1`,[p]);
  });
  const result=await execute(p,'2020-07-01');expect(result).toMatchObject({reservationCount:500,postedCount:500,totals:[{currency:'UZS',amountMinor:'500'}]});
  const seen=new Set<string>();let token:unknown=undefined,pages=0;do{const page=await folios.list(manager,p,token);pages++;for(const item of page.items){expect(seen.has(item.reservationId)).toBe(false);seen.add(item.reservationId);}token=page.nextCursor;}while(token);
  expect(pages).toBe(10);expect(seen.size).toBe(500);await expect(folios.list(manager,baseProperty,Buffer.from(JSON.stringify(['folios:'+p,randomUUID()])).toString('base64url'))).rejects.toThrow('FOLIO_INPUT_INVALID');
 },30000);
 it('preserves zero nights and default-off gates',async()=>{
  const p=await property();await stay(p,'checked_out','0','0');expect(await execute(p)).toMatchObject({reservationCount:1,postedCount:0,zeroAmountCount:1});
  vi.stubEnv('VIEWS_FOLIO_PILOT_ENABLED','false');await expect(folios.list(manager,p)).rejects.toThrow('FOLIO_DISABLED');
  vi.stubEnv('VIEWS_FOLIO_PILOT_ENABLED','true');vi.stubEnv('NODE_ENV','production');await expect(audit.inspect(manager,p,'2020-06-01')).rejects.toThrow('FOLIO_DISABLED');
 });
});
