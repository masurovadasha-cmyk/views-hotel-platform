import {afterAll,afterEach,beforeAll,beforeEach,describe,expect,it,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {DatabaseService} from '../database/database.service';
import {SupplyService} from './supply.service';
import {SupplyReadService} from './supply-read.service';
import type {Actor} from './supply.store';
const db=new DatabaseService(),supply=new SupplyService(db),read=new SupplyReadService(db);
const org='00000000-0000-0000-0000-000000000001',property='00000000-0000-0000-0000-000000000002';
const buyer:Actor={organizationId:org,userId:'76600000-0000-4000-8000-000000000001',membershipId:'76600000-0000-4000-8000-000000000011',requestId:randomUUID()};
const keeper:Actor={...buyer,userId:'76600000-0000-4000-8000-000000000002',membershipId:'76600000-0000-4000-8000-000000000012'};
const foreign:Actor={...buyer,organizationId:'10000000-0000-4000-8000-000000000001',userId:'76600000-0000-4000-8000-000000000003',membershipId:'76600000-0000-4000-8000-000000000013'};
const query=(sql:string,args:unknown[]=[],a:Actor=keeper)=>db.withActor(a,c=>c.query(sql,args));
async function item(){return (await supply.createItem(buyer,randomUUID(),{propertyId:property,sku:randomUUID().toUpperCase(),name:'Synthetic soap',unit:'piece'})).itemId as string;}
async function order(itemId:string,quantity='10'){return (await supply.createOrder(buyer,randomUUID(),{propertyId:property,reference:'Synthetic purchase',lines:[{itemId,quantity}]})).orderId as string;}
async function received(quantity='10'){const itemId=await item(),orderId=await order(itemId,quantity);await supply.receive(keeper,orderId,randomUUID(),{});return {itemId,orderId};}
beforeAll(async()=>expect((await db.query("SELECT shobj_description((SELECT oid FROM pg_database WHERE datname=current_database()),'pg_database') marker")).rows[0].marker).toBe('VIEWS_DISPOSABLE_CORE_TEST'));
beforeEach(()=>{vi.stubEnv('NODE_ENV','test');vi.stubEnv('VIEWS_LOCAL_REHEARSAL','true');vi.stubEnv('VIEWS_SUPPLY_PILOT_ENABLED','true');});afterEach(()=>vi.unstubAllEnvs());afterAll(()=>db.onModuleDestroy());
describe.sequential('separate procurement and warehouse / actual PostgreSQL',()=>{
 it('receives exact bigint quantities without money or privilege crossover',async()=>{
  const itemId=await item(),orderId=await order(itemId,'9007199254740993');
  await expect(supply.receive(buyer,orderId,randomUUID(),{})).rejects.toThrow('PROPERTY_FORBIDDEN');
  await expect(supply.createOrder(keeper,randomUUID(),{propertyId:property,reference:'Forbidden',lines:[{itemId,quantity:'1'}]})).rejects.toThrow('PROPERTY_FORBIDDEN');
  const key=randomUUID(),r=await supply.receive(keeper,orderId,key,{});expect(r.status).toBe('received');expect(await supply.receive(keeper,orderId,key,{})).toEqual({...r,idempotentReplay:true});
  expect((await query('SELECT quantity::text FROM supply_balances WHERE item_id=$1',[itemId])).rows[0].quantity).toBe('9007199254740993');
  expect((await query('SELECT count(*)::int n FROM supply_movements WHERE receipt_id=$1',[r.receiptId])).rows[0].n).toBe(1);
  expect((await query('SELECT count(*)::int n FROM ledger_journals WHERE reference_id=$1',[orderId])).rows[0].n).toBe(0);
 });
 it('serializes competing issues and exact replay without a negative stock balance',async()=>{
  const f=await received(),keys=[randomUUID(),randomUUID()],body={propertyId:property,itemId:f.itemId,quantity:'7',reference:'Cleaning shift'};
  const results=await Promise.allSettled(keys.map(key=>supply.issue(keeper,key,body)));expect(results.filter(x=>x.status==='fulfilled')).toHaveLength(1);
  const index=results.findIndex(x=>x.status==='fulfilled'),successful=results[index] as PromiseFulfilledResult<any>;
  expect(await supply.issue(keeper,keys[index],body)).toEqual({...successful.value,idempotentReplay:true});
  await expect(supply.issue(keeper,keys[index],{...body,quantity:'1'})).rejects.toThrow('SUPPLY_COMMAND_CONFLICT');
  expect((await query('SELECT quantity::text FROM supply_balances WHERE item_id=$1',[f.itemId])).rows[0].quantity).toBe('3');
  expect((await query("SELECT count(*)::int n FROM supply_movements WHERE item_id=$1 AND kind='issue'",[f.itemId])).rows[0].n).toBe(1);
 });
 it('receives an order once under concurrent keys and rejects overflow atomically',async()=>{
  const itemId=await item(),orderId=await order(itemId,'9223372036854775807');
  const results=await Promise.allSettled(Array.from({length:3},()=>supply.receive(keeper,orderId,randomUUID(),{})));expect(results.filter(x=>x.status==='fulfilled')).toHaveLength(1);
  const extra=await order(itemId,'1');await expect(supply.receive(keeper,extra,randomUUID(),{})).rejects.toThrow('STOCK_LIMIT_EXCEEDED');
  expect((await query('SELECT status FROM supply_orders WHERE id=$1',[extra])).rows[0].status).toBe('ordered');
  expect((await query('SELECT count(*)::int n FROM supply_receipts WHERE order_id=$1',[extra])).rows[0].n).toBe(0);
 });
 it('enforces direct SQL receipt completion, immutable received orders and trigger-owned balances',async()=>{
  const f=await received(),second=await item();
  await expect(query('INSERT INTO supply_order_lines(organization_id,property_id,order_id,item_id,quantity) VALUES($1,$2,$3,$4,1)',[org,property,f.orderId,second],buyer)).rejects.toThrow('SUPPLY_ORDER_IMMUTABLE');
  await expect(query("INSERT INTO supply_orders(organization_id,property_id,reference,status) VALUES($1,$2,'bad','received')",[org,property],buyer)).rejects.toThrow('SUPPLY_ORDER_INITIAL_STATE');
  expect((await query('UPDATE supply_balances SET quantity=0 WHERE item_id=$1',[f.itemId])).rowCount).toBe(0);
  expect((await query('DELETE FROM supply_movements WHERE item_id=$1',[f.itemId])).rowCount).toBe(0);
  const pending=await order(second);await expect(query('INSERT INTO supply_receipts(organization_id,property_id,order_id,actor_user_id,actor_membership_id) VALUES($1,$2,$3,$4,$5)',[org,property,pending,keeper.userId,keeper.membershipId])).rejects.toThrow('SUPPLY_RECEIPT_INCOMPLETE');
  expect((await query('SELECT count(*)::int n FROM supply_receipts WHERE order_id=$1',[pending])).rows[0].n).toBe(0);
 });
 it('denies foreign tenants, mismatched actor and wrong property before data or replay',async()=>{
  const f=await received(),key=randomUUID(),body={propertyId:property,itemId:f.itemId,quantity:'1',reference:'Synthetic'};
  await supply.issue(keeper,key,body);
  await expect(supply.issue({...keeper,userId:buyer.userId},key,body)).rejects.toThrow('PROPERTY_FORBIDDEN');
  await expect(read.list(foreign,'stock',property)).rejects.toThrow('PROPERTY_FORBIDDEN');
  expect((await query('SELECT * FROM supply_items WHERE id=$1',[f.itemId],foreign)).rows).toHaveLength(0);
  await expect(supply.issue(buyer,randomUUID(),body)).rejects.toThrow('PROPERTY_FORBIDDEN');
  expect((await read.properties(buyer)).items.map(x=>x.id)).toEqual([property]);
 });
 it('rolls back all receipt effects when audit recording fails',async()=>{
  const itemId=await item(),orderId=await order(itemId);
  const broken={withActor:(a:Actor,work:Parameters<DatabaseService['withActor']>[1])=>db.withActor(a,c=>work(new Proxy(c,{get(target,key){if(key==='query')return(sql:string,args:unknown[])=>{if(sql.startsWith('INSERT INTO audit_log'))throw Error('SYNTHETIC_AUDIT_FAILURE');return target.query(sql,args);};return Reflect.get(target,key);}})))} as DatabaseService;
  await expect(new SupplyService(broken).receive(keeper,orderId,randomUUID(),{})).rejects.toThrow('SYNTHETIC_AUDIT_FAILURE');
  expect((await query('SELECT status FROM supply_orders WHERE id=$1',[orderId])).rows[0].status).toBe('ordered');
  expect((await query('SELECT * FROM supply_balances WHERE item_id=$1',[itemId])).rows).toHaveLength(0);
  expect((await query('SELECT * FROM supply_receipts WHERE order_id=$1',[orderId])).rows).toHaveLength(0);
 });
 it('paginates catalog and zero balances without losing stock or mixing cursor scope',async()=>{
  const created=new Set<string>();for(let n=0;n<52;n++)created.add(await item());
  let cursor:string|null=null;const seen=new Set<string>();do{const page=await read.list(buyer,'items',property,cursor??undefined);expect(page.items.length).toBeLessThanOrEqual(50);for(const row of page.items)seen.add(row.id);cursor=page.nextCursor;}while(cursor);
  for(const itemId of created)expect(seen.has(itemId)).toBe(true);
  const first=await read.list(buyer,'items',property);await expect(read.list(buyer,'stock',property,first.nextCursor)).rejects.toThrow('SUPPLY_INPUT_INVALID');
 });
 it('rejects fractional/negative inputs and stays default-off in production',async()=>{
  const itemId=await item();for(const quantity of ['0','-1','1.5','9223372036854775808'])await expect(supply.issue(keeper,randomUUID(),{propertyId:property,itemId,quantity,reference:'Invalid'})).rejects.toThrow('SUPPLY_INPUT_INVALID');
  vi.stubEnv('VIEWS_SUPPLY_PILOT_ENABLED','false');await expect(read.properties(buyer)).rejects.toThrow('SUPPLY_DISABLED');
  vi.stubEnv('VIEWS_SUPPLY_PILOT_ENABLED','true');vi.stubEnv('NODE_ENV','production');await expect(read.properties(buyer)).rejects.toThrow('SUPPLY_DISABLED');
 });
});
