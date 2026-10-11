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
const query=(sql:string,args:unknown[]=[])=>db.withActor(keeper,c=>c.query(sql,args));
async function fixture(quantities=['10','5']){const lines=[];for(const quantity of quantities){const item=await supply.createItem(buyer,randomUUID(),{propertyId:property,sku:randomUUID().toUpperCase(),name:'Synthetic partial item',unit:'piece'});lines.push({itemId:item.itemId as string,quantity});}const order=await supply.createOrder(buyer,randomUUID(),{propertyId:property,reference:'Synthetic partial shipment',lines});return {orderId:order.orderId as string,lines};}
async function view(orderId:string){let cursor: string|null=null;do{const page=await read.list(keeper,'orders',property,cursor??undefined);const order=page.items.find(x=>x.id===orderId);if(order)return order;cursor=page.nextCursor;}while(cursor);throw Error('TEST_ORDER_MISSING');}
const stock=async(itemId:string)=>(await query('SELECT COALESCE((SELECT quantity FROM supply_balances WHERE item_id=$1),0)::text n',[itemId])).rows[0].n;
beforeAll(async()=>expect((await db.query("SELECT shobj_description((SELECT oid FROM pg_database WHERE datname=current_database()),'pg_database') marker")).rows[0].marker).toBe('VIEWS_DISPOSABLE_CORE_TEST'));
beforeEach(()=>{vi.stubEnv('NODE_ENV','test');vi.stubEnv('VIEWS_LOCAL_REHEARSAL','true');vi.stubEnv('VIEWS_SUPPLY_PILOT_ENABLED','true');});afterEach(()=>vi.unstubAllEnvs());afterAll(()=>db.onModuleDestroy());
describe.sequential('partial warehouse receipts / actual PostgreSQL',()=>{
 it('posts selected shipment only, exposes exact remaining and preserves full-remaining compatibility',async()=>{
  const f=await fixture(),key=randomUUID(),body={lines:[{itemId:f.lines[0].itemId,quantity:'3'}]};
  const first=await supply.receive(keeper,f.orderId,key,body);expect(first.status).toBe('partially_received');
  const order=await view(f.orderId);expect(order.status).toBe('partially_received');
  expect(order.lines.find((l:any)=>l.itemId===f.lines[0].itemId)).toMatchObject({quantity:'10',receivedQuantity:'3',remainingQuantity:'7'});
  expect(order.lines.find((l:any)=>l.itemId===f.lines[1].itemId)).toMatchObject({receivedQuantity:'0',remainingQuantity:'5'});
  expect(await stock(f.lines[0].itemId)).toBe('3');expect(await stock(f.lines[1].itemId)).toBe('0');
  const last=await supply.receive(keeper,f.orderId,randomUUID(),{});expect(last.status).toBe('received');
  expect(await supply.receive(keeper,f.orderId,key,body)).toEqual({...first,idempotentReplay:true});
  expect(await stock(f.lines[0].itemId)).toBe('10');expect(await stock(f.lines[1].itemId)).toBe('5');
  expect((await query('SELECT count(*)::int n FROM supply_receipts WHERE order_id=$1',[f.orderId])).rows[0].n).toBe(2);
 });
 it('serializes over-receipt races and exact command retries',async()=>{
  const f=await fixture(['10']),body={lines:[{itemId:f.lines[0].itemId,quantity:'7'}]};
  const raced=await Promise.allSettled([supply.receive(keeper,f.orderId,randomUUID(),body),supply.receive(keeper,f.orderId,randomUUID(),body)]);
  expect(raced.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect((raced.find(r=>r.status==='rejected') as PromiseRejectedResult).reason.message).toBe('RECEIPT_QUANTITY_EXCEEDED');
  expect(await stock(f.lines[0].itemId)).toBe('7');
  const key=randomUUID(),rest={lines:[{itemId:f.lines[0].itemId,quantity:'3'}]},results=await Promise.all(Array.from({length:3},()=>supply.receive(keeper,f.orderId,key,rest)));
  expect(results.filter(r=>!r.idempotentReplay)).toHaveLength(1);expect(await stock(f.lines[0].itemId)).toBe('10');
  await expect(supply.receive(keeper,f.orderId,key,{lines:[{itemId:f.lines[0].itemId,quantity:'2'}]})).rejects.toThrow('SUPPLY_COMMAND_CONFLICT');
 });
 it('does not receive unordered, duplicate, zero or excessive quantities',async()=>{
  const f=await fixture(['2']);
  for(const body of [{lines:[]},{lines:[{itemId:randomUUID(),quantity:'1'}]},{lines:[{itemId:f.lines[0].itemId,quantity:'0'}]},{lines:[f.lines[0],f.lines[0]]},{lines:[f.lines[0]],status:'received'}])await expect(supply.receive(keeper,f.orderId,randomUUID(),body)).rejects.toThrow('SUPPLY_INPUT_INVALID');
  await expect(supply.receive(keeper,f.orderId,randomUUID(),{lines:[{itemId:f.lines[0].itemId,quantity:'3'}]})).rejects.toThrow('RECEIPT_QUANTITY_EXCEEDED');
  expect(await stock(f.lines[0].itemId)).toBe('0');expect((await view(f.orderId)).status).toBe('ordered');
 });
 it('keeps cumulative bigint precision across shipments',async()=>{
  const f=await fixture(['9007199254740993']),itemId=f.lines[0].itemId;
  await supply.receive(keeper,f.orderId,randomUUID(),{lines:[{itemId,quantity:'9007199254740990'}]});
  expect((await view(f.orderId)).lines[0].remainingQuantity).toBe('3');
  await supply.receive(keeper,f.orderId,randomUUID(),{lines:[{itemId,quantity:'3'}]});expect(await stock(itemId)).toBe('9007199254740993');
 });
 it('rejects direct SQL over-receipts and incomplete manifests, preserving stock and order',async()=>{
  const f=await fixture(['5']),itemId=f.lines[0].itemId,line=(await query('SELECT id FROM supply_order_lines WHERE order_id=$1',[f.orderId])).rows[0].id;
  const attempt=(amount:string,move:boolean)=>db.withActor(keeper,async c=>{const receipt=randomUUID();await c.query('INSERT INTO supply_receipts(id,organization_id,property_id,order_id,actor_user_id,actor_membership_id) VALUES($1,$2,$3,$4,$5,$6)',[receipt,org,property,f.orderId,keeper.userId,keeper.membershipId]);await c.query('INSERT INTO supply_receipt_lines(organization_id,property_id,receipt_id,order_line_id,quantity) VALUES($1,$2,$3,$4,$5)',[org,property,receipt,line,amount]);if(move)await c.query("INSERT INTO supply_movements(organization_id,property_id,item_id,kind,quantity,reference,receipt_id,order_line_id,actor_user_id,actor_membership_id) VALUES($1,$2,$3,'receipt',$4,'Synthetic SQL',$5,$6,$7,$8)",[org,property,itemId,amount,receipt,line,keeper.userId,keeper.membershipId]);});
  await expect(attempt('6',true)).rejects.toThrow('RECEIPT_QUANTITY_EXCEEDED');
  await expect(attempt('2',false)).rejects.toThrow('SUPPLY_RECEIPT_INCOMPLETE');
  expect(await stock(itemId)).toBe('0');expect((await view(f.orderId)).status).toBe('ordered');
 });
 it('rolls back a second shipment on audit failure and rejects new-role privilege crossover',async()=>{
  const f=await fixture(['10']),body={lines:[{itemId:f.lines[0].itemId,quantity:'3'}]};await supply.receive(keeper,f.orderId,randomUUID(),body);
  const broken={withActor:(a:Actor,work:Parameters<DatabaseService['withActor']>[1])=>db.withActor(a,c=>work(new Proxy(c,{get(target,key){if(key==='query')return(sql:string,args:unknown[])=>{if(sql.startsWith('INSERT INTO audit_log'))throw Error('SYNTHETIC_PARTIAL_AUDIT_FAILURE');return target.query(sql,args);};return Reflect.get(target,key);}})))} as DatabaseService;
  await expect(new SupplyService(broken).receive(keeper,f.orderId,randomUUID(),body)).rejects.toThrow('SYNTHETIC_PARTIAL_AUDIT_FAILURE');
  await expect(supply.receive(buyer,f.orderId,randomUUID(),body)).rejects.toThrow('PROPERTY_FORBIDDEN');
  expect(await stock(f.lines[0].itemId)).toBe('3');expect((await view(f.orderId)).lines[0].remainingQuantity).toBe('7');
  expect((await query('SELECT count(*)::int n FROM supply_receipts WHERE order_id=$1',[f.orderId])).rows[0].n).toBe(1);
 });
});
