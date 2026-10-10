import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {randomUUID} from 'node:crypto';
import {DatabaseService} from '../database/database.service';
import {InventorySearchService} from './inventory-search.service';
const db=new DatabaseService(),search=new InventorySearchService(db);
const actor={organizationId:'00000000-0000-0000-0000-000000000001',userId:'20000000-0000-4000-8000-000000000001',membershipId:'30000000-0000-4000-8000-000000000001',requestId:randomUUID()};
const property=randomUUID(),type=randomUUID(),policy=randomUUID(),rate=randomUUID();
const query={from:'2029-04-01',to:'2029-04-03',guests:2,city:'Synthetic B2 search'};
beforeAll(async()=>db.withActor(actor,async c=>{
 await c.query(`INSERT INTO properties(id,organization_id,name,country_code,city,timezone) VALUES($1,$2,'{"en":"Synthetic 500"}','UZ',$3,'Asia/Tashkent')`,[property,actor.organizationId,query.city]);
 await c.query(`INSERT INTO unit_types(id,property_id,name,max_guests) VALUES($1,$2,'{"en":"Synthetic"}',2)`,[type,property]);
 await c.query(`INSERT INTO units(property_id,unit_type_id,code) SELECT $1,$2,'SYNTHETIC-'||n FROM generate_series(1,500) n`,[property,type]);
 await c.query(`INSERT INTO cancellation_policy_templates(id,organization_id,code,name,rules) VALUES($1,$2,$3,'{"en":"Synthetic"}','{"version":1,"rules":[{"minHoursBeforeCheckIn":0,"refundBps":0}],"nonRefundableLineCodes":[]}')`,[policy,actor.organizationId,policy]);
 await c.query(`INSERT INTO rate_plans(id,property_id,unit_type_id,name,currency,base_nightly_minor,cancellation_policy_id) VALUES($1,$2,$3,'{"en":"Synthetic"}','UZS',100000,$4)`,[rate,property,type,policy]);
}));
afterAll(()=>db.onModuleDestroy());
describe.sequential('B2 paginated staff inventory search',()=>{
 it('reaches all 500 units without duplicate or missing pages and binds cursors to filters',async()=>{
  const ids=new Set<string>();let cursor:string|undefined;let pages=0;
  do{const page=await search.search(actor,{...query,cursor});expect(page.items.length).toBeLessThanOrEqual(50);expect(page.requiresQuote).toBe(true);
   for(const row of page.items){expect(ids.has(row.unitId)).toBe(false);ids.add(row.unitId);expect(row.baseNightlyMinor).toBe('100000');}
   if(pages===0)await expect(search.search(actor,{...query,guests:1,cursor:page.nextCursor})).rejects.toThrow('INVALID_SEARCH_CURSOR');
   cursor=page.nextCursor??undefined;pages++;
  }while(cursor&&pages<20);
  expect(pages).toBe(10);expect(ids.size).toBe(500);expect(cursor).toBeUndefined();
 });
 it('filters capacity and city and rejects property scope or mismatched identity',async()=>{
  expect((await search.search(actor,{...query,guests:3})).items).toEqual([]);
  expect((await search.search(actor,{...query,city:'No such synthetic city'})).items).toEqual([]);
  const frontdesk={...actor,userId:'20000000-0000-4000-8000-000000000002',membershipId:'30000000-0000-4000-8000-000000000002'};
  expect((await search.search(frontdesk,query)).items).toEqual([]);
  expect((await search.search({...actor,userId:frontdesk.userId},query)).items).toEqual([]);
 });
 it('excludes every occupied interval including an expired unreleased hold, allows adjacent checkout',async()=>{
  const units=(await search.search(actor,query)).items.slice(0,4).map(r=>r.unitId);
  for(const [index,kind] of ['maintenance','host_block','external_calendar','payment_hold'].entries()){
   await db.withActor(actor,async c=>{
    const reservation=randomUUID();
    if(kind==='payment_hold')await c.query(`INSERT INTO reservations(id,organization_id,property_id,unit_id,confirmation_code,status,check_in_at,check_out_at,currency,cancellation_policy_snapshot,hold_expires_at) VALUES($1,$2,$3,$4,$1::uuid::text,'hold','2029-04-01T14:00+05','2029-04-03T12:00+05','UZS','{}',now()-interval '1 hour')`,[reservation,actor.organizationId,property,units[index]]);
    await c.query(`INSERT INTO inventory_periods(organization_id,property_id,unit_id,kind,source_ref,reservation_id,stay_period,expires_at) VALUES($1,$2,$3,$4,'synthetic',$5,tstzrange('2029-04-01T14:00+05','2029-04-03T12:00+05','[)'),$6)`,[actor.organizationId,property,units[index],kind,kind==='payment_hold'?reservation:null,kind==='payment_hold'?new Date(Date.now()-3600000):null]);
   });
  }
  expect((await search.search(actor,query)).items.some(x=>units.includes(x.unitId))).toBe(false);
  expect((await search.search(actor,{...query,from:'2029-04-03',to:'2029-04-04'})).items.filter(x=>units.includes(x.unitId))).toHaveLength(4);
 });
 it.each([{from:'2029-02-30'},{to:'2030-04-01'},{guests:0},{guests:'1 OR 1=1'},{cursor:'bad'}])('rejects invalid search input %#',async value=>{await expect(search.search(actor,{...query,...value})).rejects.toThrow();});
});
