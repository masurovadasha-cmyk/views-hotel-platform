import {afterAll,afterEach,beforeAll,beforeEach,describe,expect,it,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {DatabaseService} from '../database/database.service';
import {SupplyReadService} from './supply-read.service';
import {SupplyService} from './supply.service';
import {SupplyStocktakeService} from './supply-stocktake.service';
import type {Actor} from './supply.store';
const db=new DatabaseService(),supply=new SupplyService(db),counts=new SupplyStocktakeService(db);
const org='00000000-0000-0000-0000-000000000001',property='00000000-0000-0000-0000-000000000002';
const buyer:Actor={organizationId:org,userId:'76600000-0000-4000-8000-000000000001',membershipId:'76600000-0000-4000-8000-000000000011',requestId:randomUUID()};
const keeper:Actor={...buyer,userId:'76600000-0000-4000-8000-000000000002',membershipId:'76600000-0000-4000-8000-000000000012'};
const foreign:Actor={...buyer,organizationId:'10000000-0000-4000-8000-000000000001',userId:'76600000-0000-4000-8000-000000000003',membershipId:'76600000-0000-4000-8000-000000000013'};
const query=(sql:string,p:unknown[]=[],actor=keeper)=>db.withActor(actor,c=>c.query(sql,p));
async function item(){return (await supply.createItem(buyer,randomUUID(),{propertyId:property,sku:randomUUID().toUpperCase(),name:'Synthetic stocktake',unit:'piece'})).itemId as string;}
async function preview(itemId:string,countedQuantity:string){const p=await counts.preview(keeper,{propertyId:property,itemId,countedQuantity,reason:'Synthetic physical count'});return {propertyId:p.propertyId,itemId:p.itemId,countedQuantity:p.countedQuantity,reason:p.reason,expectedQuantity:p.expectedQuantity,expectedRevision:p.expectedRevision};}
async function balance(itemId:string){return (await query('SELECT quantity::text,revision::text FROM supply_balances WHERE item_id=$1',[itemId])).rows[0];}
async function receive(itemId:string,quantity:string){const order=await supply.createOrder(buyer,randomUUID(),{propertyId:property,reference:'Synthetic receipt',lines:[{itemId,quantity}]});await supply.receive(keeper,order.orderId,randomUUID(),{});}
beforeAll(async()=>expect((await db.query("SELECT shobj_description((SELECT oid FROM pg_database WHERE datname=current_database()),'pg_database') marker")).rows[0].marker).toBe('VIEWS_DISPOSABLE_CORE_TEST'));
beforeEach(()=>{vi.stubEnv('NODE_ENV','test');vi.stubEnv('VIEWS_LOCAL_REHEARSAL','true');vi.stubEnv('VIEWS_SUPPLY_PILOT_ENABLED','true');});afterEach(()=>vi.unstubAllEnvs());afterAll(()=>db.onModuleDestroy());
describe.sequential('physical stocktake / actual PostgreSQL',()=>{
 it('projects counted lots through known moves and fails closed on unallocated issues',async()=>{
  const itemId=await item();await receive(itemId,'10');const snap=await counts.confirm(keeper,randomUUID(),{...await preview(itemId,'10'),lots:[{lotCode:'PROJECTION',expiresOn:'2028-01-01',quantity:'10'}]});
  const projection=async()=>(await new SupplyReadService(db).list(keeper,'stock',property)).items.find(x=>x.itemId===itemId)!.lotProjection;
  expect(await projection()).toMatchObject({status:'reconciled',totalQuantity:'10',lots:[{lotCode:'PROJECTION',quantity:'10'}]});
  const key=randomUUID(),body={propertyId:property,itemId,quantity:'2',reference:'Projection issue',lotAllocation:{snapshotId:snap.stocktakeId,lotCode:'PROJECTION',expiresOn:'2028-01-01'}};await supply.issue(keeper,key,body);await supply.issue(keeper,key,body);
  expect(await projection()).toMatchObject({status:'reconciled',totalQuantity:'8',lots:[{quantity:'8'}]});
  await Promise.all([receive(itemId,'2'),receive(itemId,'3')]);const current=await projection();expect(current.totalQuantity).toBe('13');expect(current.lots).toEqual(expect.arrayContaining([{lotCode:null,expiresOn:null,quantity:'5'},{lotCode:'PROJECTION',expiresOn:'2028-01-01',quantity:'8'}]));
  await expect(supply.issue(keeper,randomUUID(),{propertyId:property,itemId,quantity:'99',reference:'Rejected'})).rejects.toThrow();expect(await projection()).toEqual(current);
  await supply.issue(keeper,randomUUID(),{propertyId:property,itemId,quantity:'1',reference:'Unallocated issue'});expect(await projection()).toMatchObject({status:'recount_required',totalQuantity:'12',lots:null});
  await receive(itemId,'1');expect(await projection()).toMatchObject({status:'recount_required',totalQuantity:'13',lots:null});
  await counts.confirm(keeper,randomUUID(),{...await preview(itemId,'13'),lots:[{lotCode:null,expiresOn:null,quantity:'13'}]});expect(await projection()).toMatchObject({status:'reconciled',totalQuantity:'13'});
  const restored=await projection();await expect(db.withActor(keeper,async c=>{await c.query("INSERT INTO supply_movements(organization_id,property_id,item_id,kind,quantity,reference,actor_user_id,actor_membership_id) VALUES($1,$2,$3,'issue',-1,'Rollback projection',$4,$5)",[org,property,itemId,keeper.userId,keeper.membershipId]);throw Error('ROLLBACK_PROJECTION');})).rejects.toThrow('ROLLBACK_PROJECTION');expect(await projection()).toEqual(restored);
  const order=await supply.createOrder(buyer,randomUUID(),{propertyId:property,reference:'Known lot receipt',lines:[{itemId,quantity:'2'}]});await supply.receive(keeper,order.orderId,randomUUID(),{lines:[{itemId,quantity:'2',lotCode:'NEW',expiresOn:'2028-01-01'}]});expect(await projection()).toMatchObject({status:'reconciled',totalQuantity:'15',lots:expect.arrayContaining([{lotCode:'NEW',expiresOn:'2028-01-01',quantity:'2'}])});
  expect((await query('SELECT * FROM supply_lot_projections WHERE item_id=$1',[itemId],foreign)).rows).toHaveLength(0);
  expect((await query("UPDATE supply_lot_projections SET status='recount_required' WHERE item_id=$1",[itemId])).rowCount).toBe(0);
 });
 it('honours property end-of-day expiry and atomically rejects an expired selected lot',async()=>{
  const dates=(await query("SELECT app.lot_date_allowed('2026-10-14','Asia/Tashkent','2026-10-14T18:59:59Z') before,app.lot_date_allowed('2026-10-14','Asia/Tashkent','2026-10-14T19:00:00Z') after,app.lot_date_allowed(NULL,'Asia/Tashkent','2026-10-14T18:00:00Z') unknown")).rows[0];expect(dates).toEqual({before:true,after:false,unknown:false});
  const itemId=await item();await receive(itemId,'4');const snap=await counts.confirm(keeper,randomUUID(),{...await preview(itemId,'4'),lots:[{lotCode:'EXPIRED',expiresOn:'2000-01-01',quantity:'4'}]});
  const before=await balance(itemId);await expect(supply.issue(keeper,randomUUID(),{propertyId:property,itemId,quantity:'1',reference:'Expired item',lotAllocation:{snapshotId:snap.stocktakeId,lotCode:'EXPIRED',expiresOn:'2000-01-01'}})).rejects.toThrow('SERVICE_STOCK_UNAVAILABLE');expect(await balance(itemId)).toEqual(before);
 });
 it('issues a selected counted lot once and rejects stale or insufficient lot provenance',async()=>{
  const itemId=await item();await receive(itemId,'10');const lots=[{lotCode:'A',expiresOn:'2028-02-29',quantity:'7'},{lotCode:null,expiresOn:null,quantity:'3'}];
  const snap=await counts.confirm(keeper,randomUUID(),{...await preview(itemId,'10'),lots});
  const lotAllocation={snapshotId:snap.stocktakeId,lotCode:'A',expiresOn:'2028-02-29'},body={propertyId:property,itemId,quantity:'2',reference:'Physical lot issue',lotAllocation},key=randomUUID();
  await expect(supply.issue(keeper,randomUUID(),{...body,quantity:'8'})).rejects.toThrow('INSUFFICIENT_STOCK');
  await expect(supply.issue(keeper,randomUUID(),{...body,lotAllocation:{...lotAllocation,lotCode:'OTHER'}})).rejects.toThrow('INSUFFICIENT_STOCK');
  await expect(supply.issue(buyer,key,body)).rejects.toThrow('PROPERTY_FORBIDDEN');await expect(supply.issue(foreign,key,body)).rejects.toThrow('PROPERTY_FORBIDDEN');
  await expect(supply.issue(keeper,randomUUID(),{...body,itemId:await item()})).rejects.toThrow('STOCKTAKE_STALE');
  const broken={withActor:(a:Actor,work:Parameters<DatabaseService['withActor']>[1])=>db.withActor(a,c=>work(new Proxy(c,{get(target,k){if(k==='query')return(sql:string,args:unknown[])=>{if(sql.startsWith('INSERT INTO audit_log'))throw Error('LOT_ROLLBACK');return target.query(sql,args);};return Reflect.get(target,k);}})))} as DatabaseService;
  await expect(new SupplyService(broken).issue(keeper,randomUUID(),body)).rejects.toThrow('LOT_ROLLBACK');expect((await balance(itemId)).quantity).toBe('10');
  const results=await Promise.all([supply.issue(keeper,key,body),supply.issue(keeper,key,body)]);expect(results.filter(r=>!r.idempotentReplay)).toHaveLength(1);expect((await balance(itemId)).quantity).toBe('8');
  expect((await query('SELECT lot_allocation FROM supply_movements WHERE id=$1',[results[0].movementId])).rows[0].lot_allocation).toEqual(lotAllocation);
  await expect(supply.issue(keeper,randomUUID(),body)).rejects.toThrow('STOCKTAKE_STALE');
  await expect(supply.issue(keeper,key,{...body,quantity:'1'})).rejects.toThrow('SUPPLY_COMMAND_CONFLICT');
 });
 it('allows one concurrent allocation per physical count and supports explicitly unknown origin',async()=>{
  const itemId=await item();await receive(itemId,'4');const snap=await counts.confirm(keeper,randomUUID(),{...await preview(itemId,'4'),lots:[{lotCode:null,expiresOn:null,quantity:'4'}]});
  const body={propertyId:property,itemId,quantity:'1',reference:'Unknown lot',lotAllocation:{snapshotId:snap.stocktakeId,lotCode:null,expiresOn:null}};
  const results=await Promise.allSettled([supply.issue(keeper,randomUUID(),body),supply.issue(keeper,randomUUID(),body)]);expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect((await balance(itemId)).quantity).toBe('3');
 });
 it('saves a scoped immutable lot snapshot once, then marks it stale after an issue',async()=>{
  const itemId=await item();await receive(itemId,'10');const lots=[{lotCode:'A',expiresOn:'2028-02-29',quantity:'7'},{lotCode:null,expiresOn:null,quantity:'3'}];
  const p={...await preview(itemId,'10'),lots},key=randomUUID();
  const replies=await Promise.all([counts.confirm(keeper,key,p),counts.confirm(keeper,key,p)]);expect(replies.filter(r=>!r.idempotentReplay)).toHaveLength(1);
  const read=new SupplyReadService(db),snapshot=async()=>{let cursor:string|undefined;do{const page=await read.list(keeper,'stock',property,cursor),found=page.items.find(r=>r.itemId===itemId);if(found)return found.lotSnapshot;cursor=page.nextCursor??undefined;}while(cursor);throw Error('ITEM_NOT_FOUND');};
  expect((await query('SELECT j.status FROM supply_lot_movement_intake j JOIN supply_movements m ON m.id=j.movement_id WHERE m.stocktake_id=$1',[replies[0].stocktakeId])).rows).toEqual([{status:'snapshot_recorded'}]);
  expect(await snapshot()).toMatchObject({lots,current:true});expect((await balance(itemId)).quantity).toBe('10');
  await expect(counts.confirm(keeper,key,{...p,lots:[{...lots[0],quantity:'6'},{...lots[1],quantity:'4'}]})).rejects.toThrow('SUPPLY_COMMAND_CONFLICT');
  await expect(counts.confirm(buyer,randomUUID(),p)).rejects.toThrow('PROPERTY_FORBIDDEN');
  expect((await query('SELECT lot_counts FROM supply_stocktakes WHERE item_id=$1',[itemId],foreign)).rows).toHaveLength(0);
  expect((await query('UPDATE supply_stocktakes SET lot_counts=NULL WHERE item_id=$1',[itemId])).rowCount).toBe(0);
  await supply.issue(keeper,randomUUID(),{propertyId:property,itemId,quantity:'1',reference:'After lot count'});
  expect(await snapshot()).toMatchObject({lots,current:false});await expect(counts.confirm(keeper,randomUUID(),p)).rejects.toThrow('STOCKTAKE_STALE');
 });
 it('serializes competing lot counts and validates direct SQL lot metadata',async()=>{
  const itemId=await item();await receive(itemId,'10');const p={...await preview(itemId,'10'),lots:[{lotCode:null,expiresOn:null,quantity:'10'}]};
  const results=await Promise.allSettled([counts.confirm(keeper,randomUUID(),p),counts.confirm(keeper,randomUUID(),p)]);expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
  expect((await query('SELECT app.valid_lot_count_snapshot($1::jsonb,10) ok',[JSON.stringify([{lotCode:'A',expiresOn:'2027-02-29',quantity:'10'}])])).rows[0].ok).toBe(false);
  const fresh={...await preview(itemId,'10'),lots:p.lots};const raced=await Promise.allSettled([counts.confirm(keeper,randomUUID(),fresh),supply.issue(keeper,randomUUID(),{propertyId:property,itemId,quantity:'1',reference:'Race'})]);
  expect(raced[1].status).toBe('fulfilled');expect((await balance(itemId)).quantity).toBe('9');if(raced[0].status==='rejected')expect(raced[0].reason.message).toBe('STOCKTAKE_STALE');
 });
 it('rejects invalid lot sums, dates and changing physical stock with a lot snapshot',async()=>{
  const itemId=await item();await receive(itemId,'10');const p=await preview(itemId,'10');
  for(const lots of [[],[{lotCode:'A',expiresOn:'2027-02-29',quantity:'10'}],[{lotCode:null,expiresOn:null,quantity:'9'}]])await expect(counts.confirm(keeper,randomUUID(),{...p,lots})).rejects.toThrow('SUPPLY_INPUT_INVALID');
  await expect(counts.confirm(keeper,randomUUID(),{...p,countedQuantity:'9',lots:[{lotCode:null,expiresOn:null,quantity:'9'}]})).rejects.toThrow('SUPPLY_INPUT_INVALID');
 });
 it('records exact positive, negative and zero adjustments atomically without money',async()=>{
  const itemId=await item();expect((await preview(itemId,'9007199254740993')).expectedQuantity).toBe('0');expect(await balance(itemId)).toBeUndefined();
  const positive=await counts.confirm(keeper,randomUUID(),await preview(itemId,'9007199254740993'));expect(positive).toMatchObject({deltaQuantity:'9007199254740993',remainingQuantity:'9007199254740993'});
  const negative=await counts.confirm(keeper,randomUUID(),await preview(itemId,'0'));expect(negative.deltaQuantity).toBe('-9007199254740993');
  const zero=await counts.confirm(keeper,randomUUID(),await preview(itemId,'0'));expect(zero.deltaQuantity).toBe('0');expect((await query('SELECT status FROM supply_lot_movement_intake WHERE movement_id=$1',[zero.movementId])).rows).toEqual([{status:'allocation_pending'}]);expect(zero.movementId).toMatch(/^[a-f0-9-]{36}$/);
  expect(await balance(itemId)).toEqual({quantity:'0',revision:'3'});
  expect((await query("SELECT quantity::text,kind FROM supply_movements WHERE stocktake_id=$1",[zero.stocktakeId])).rows).toEqual([{quantity:'0',kind:'adjustment'}]);
  expect((await query('SELECT * FROM ledger_journals WHERE reference_id=ANY($1::uuid[])',[[positive.stocktakeId,negative.stocktakeId,zero.stocktakeId]])).rows).toHaveLength(0);
 });
 it('rejects stale balance and movement revision even when issue and receipt restore the old quantity',async()=>{
  const itemId=await item();await receive(itemId,'10');const p=await preview(itemId,'9');
  await supply.issue(keeper,randomUUID(),{propertyId:property,itemId,quantity:'2',reference:'Synthetic issue'});await expect(counts.confirm(keeper,randomUUID(),p)).rejects.toThrow('STOCKTAKE_STALE');
  await receive(itemId,'2');expect((await balance(itemId)).quantity).toBe('10');await expect(counts.confirm(keeper,randomUUID(),p)).rejects.toThrow('STOCKTAKE_STALE');
  expect((await query('SELECT * FROM supply_stocktakes WHERE item_id=$1',[itemId])).rows).toHaveLength(0);
 });
 it('serializes lost-response retries and compares reason, item and counted quantity',async()=>{
  const itemId=await item(),p=await preview(itemId,'5'),key=randomUUID();const receipts=await Promise.all(Array.from({length:4},()=>counts.confirm(keeper,key,p)));
  expect(receipts.filter(r=>!r.idempotentReplay)).toHaveLength(1);expect(new Set(receipts.map(r=>r.stocktakeId)).size).toBe(1);
  for(const changed of [{...p,reason:'Changed reason'},{...p,countedQuantity:'6'},{...p,itemId:await item()}])await expect(counts.confirm(keeper,key,changed)).rejects.toThrow('SUPPLY_COMMAND_CONFLICT');
  expect((await query("SELECT count(*)::int n FROM audit_log WHERE entity_id=$1 AND action='supply.stocktake_recorded'",[receipts[0].stocktakeId])).rows[0].n).toBe(1);
  expect((await query('SELECT * FROM supply_stocktakes WHERE item_id=$1',[itemId])).rows).toHaveLength(1);
 });
 it('allows one of simultaneous independent counts and invalidates a second zero-delta observation',async()=>{
  const itemId=await item(),p=await preview(itemId,'0');const results=await Promise.allSettled([counts.confirm(keeper,randomUUID(),p),counts.confirm(keeper,randomUUID(),p)]);
  expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect((await balance(itemId)).revision).toBe('1');
  const failed=results.find(r=>r.status==='rejected') as PromiseRejectedResult;expect(failed.reason.message).toBe('STOCKTAKE_STALE');
 });
 it('denies procurement, foreign scopes and spoofed actors before preview or replay',async()=>{
  const itemId=await item(),p=await preview(itemId,'1'),key=randomUUID();await counts.confirm(keeper,key,p);
  await expect(counts.preview(buyer,{propertyId:property,itemId,countedQuantity:'1',reason:'Denied'})).rejects.toThrow('PROPERTY_FORBIDDEN');
  for(const actor of [buyer,foreign,{...keeper,userId:buyer.userId}])await expect(counts.confirm(actor,key,p)).rejects.toThrow('PROPERTY_FORBIDDEN');
  expect((await query('SELECT * FROM supply_stocktakes WHERE item_id=$1',[itemId],foreign)).rows).toHaveLength(0);
  expect((await query('UPDATE supply_stocktakes SET counted_quantity=99 WHERE item_id=$1',[itemId])).rowCount).toBe(0);
 });
 it('enforces complete count/movement provenance and blocks direct fake adjustment SQL',async()=>{
  const itemId=await item();
  await expect(query('INSERT INTO supply_stocktakes(organization_id,property_id,item_id,expected_quantity,counted_quantity,expected_revision,reason,actor_user_id,actor_membership_id) VALUES($1,$2,$3,0,2,0,$4,$5,$6)',[org,property,itemId,'Synthetic incomplete',keeper.userId,keeper.membershipId])).rejects.toThrow('STOCKTAKE_INCOMPLETE');
  await expect(query("INSERT INTO supply_movements(organization_id,property_id,item_id,kind,quantity,reference,stocktake_id,actor_user_id,actor_membership_id) VALUES($1,$2,$3,'adjustment',10,'Synthetic forged',$4,$5,$6)",[org,property,itemId,randomUUID(),keeper.userId,keeper.membershipId])).rejects.toThrow('STOCKTAKE_ADJUSTMENT_MISMATCH');
  expect(await balance(itemId)).toBeUndefined();
 });
 it('rolls back count, movement, balance and revision when the audit write fails',async()=>{
  const itemId=await item(),p=await preview(itemId,'10');
  const broken={withActor:(a:Actor,work:Parameters<DatabaseService['withActor']>[1])=>db.withActor(a,c=>work(new Proxy(c,{get(target,key){if(key==='query')return(sql:string,args:unknown[])=>{if(sql.startsWith('INSERT INTO audit_log'))throw Error('SYNTHETIC_AUDIT_FAILURE');return target.query(sql,args);};return Reflect.get(target,key);}})))} as DatabaseService;
  await expect(new SupplyStocktakeService(broken).confirm(keeper,randomUUID(),p)).rejects.toThrow('SYNTHETIC_AUDIT_FAILURE');expect(await balance(itemId)).toBeUndefined();expect((await query('SELECT * FROM supply_stocktakes WHERE item_id=$1',[itemId])).rows).toHaveLength(0);expect((await query('SELECT * FROM supply_movements WHERE item_id=$1',[itemId])).rows).toHaveLength(0);
 });
 it('validates physical counts and keeps existing disconnected local-only gates',async()=>{
  const itemId=await item();for(const countedQuantity of ['-1','1.5','01','9223372036854775808'])await expect(counts.preview(keeper,{propertyId:property,itemId,countedQuantity,reason:'Invalid'})).rejects.toThrow('SUPPLY_INPUT_INVALID');
  const p=await preview(itemId,'9223372036854775807');expect((await counts.confirm(keeper,randomUUID(),p)).remainingQuantity).toBe('9223372036854775807');
  vi.stubEnv('VIEWS_SUPPLY_PILOT_ENABLED','false');await expect(counts.preview(keeper,{propertyId:property,itemId,countedQuantity:'0',reason:'Invalid'})).rejects.toThrow('SUPPLY_DISABLED');vi.stubEnv('VIEWS_SUPPLY_PILOT_ENABLED','true');vi.stubEnv('NODE_ENV','production');await expect(counts.confirm(keeper,randomUUID(),p)).rejects.toThrow('SUPPLY_DISABLED');
 });
});
