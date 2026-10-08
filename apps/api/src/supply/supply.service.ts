import {ConflictException,Injectable,NotFoundException} from '@nestjs/common';
import {randomUUID} from 'node:crypto';
import {DatabaseService} from '../database/database.service';
import * as input from './supply.input';
import {access,enabled,mapped,record,replay,type Actor} from './supply.store';
@Injectable()
export class SupplyService{
 constructor(private readonly db:DatabaseService){}
 async createItem(a:Actor,key:unknown,raw:unknown){enabled();const b=input.item(raw),command=input.id(key),payload={type:'item',...b};try{return await this.db.withActor(a,async c=>{
  const prior=await replay(c,a,b.propertyId,command,'purchase.manage',payload);if(prior)return prior;
  const itemId=randomUUID();await c.query('INSERT INTO supply_items(id,organization_id,property_id,sku,name,unit) VALUES($1,$2,$3,$4,$5,$6)',[itemId,a.organizationId,b.propertyId,b.sku,b.name,b.unit]);
  const result={itemId,idempotentReplay:false};await record(c,a,b.propertyId,command,'purchase.manage',payload,result,'supply.item_created',itemId);return result;
 });}catch(e){mapped(e);}}
 async createOrder(a:Actor,key:unknown,raw:unknown){enabled();const b=input.order(raw),command=input.id(key),payload={type:'order',...b};try{return await this.db.withActor(a,async c=>{
  const prior=await replay(c,a,b.propertyId,command,'purchase.manage',payload);if(prior)return prior;
  const items=(await c.query('SELECT id FROM supply_items WHERE organization_id=$1 AND property_id=$2 AND id=ANY($3::uuid[]) ORDER BY id',[a.organizationId,b.propertyId,b.lines.map(l=>l.itemId)])).rows;
  if(items.length!==b.lines.length)throw new NotFoundException('SUPPLY_NOT_FOUND');
  const orderId=randomUUID();await c.query('INSERT INTO supply_orders(id,organization_id,property_id,reference) VALUES($1,$2,$3,$4)',[orderId,a.organizationId,b.propertyId,b.reference]);
  for(const line of b.lines)await c.query('INSERT INTO supply_order_lines(organization_id,property_id,order_id,item_id,quantity) VALUES($1,$2,$3,$4,$5)',[a.organizationId,b.propertyId,orderId,line.itemId,line.quantity]);
  const result={orderId,status:'ordered',idempotentReplay:false};await record(c,a,b.propertyId,command,'purchase.manage',payload,result,'supply.order_created',orderId);return result;
 });}catch(e){mapped(e);}}
 async receive(a:Actor,target:unknown,key:unknown,raw:unknown){enabled();input.exact(raw,[]);const orderId=input.id(target),command=input.id(key),payload={type:'receive',orderId};try{return await this.db.withActor(a,async c=>{
  const initial=(await c.query('SELECT property_id FROM supply_orders WHERE id=$1 AND organization_id=$2',[orderId,a.organizationId])).rows[0];if(!initial)throw new NotFoundException('SUPPLY_NOT_FOUND');
  const prior=await replay(c,a,initial.property_id,command,'stock.manage',payload);if(prior)return prior;
  const order=(await c.query('SELECT property_id,reference,status FROM supply_orders WHERE id=$1 FOR UPDATE',[orderId])).rows[0];await access(c,a,order.property_id,'stock.manage');
  if(order.status!=='ordered')throw new ConflictException('ORDER_ALREADY_RECEIVED');
  const lines=(await c.query<{id:string;item_id:string;quantity:string}>('SELECT id,item_id,quantity::text FROM supply_order_lines WHERE order_id=$1 ORDER BY item_id',[orderId])).rows;if(!lines.length)throw new ConflictException('SUPPLY_ORDER_EMPTY');
  const receiptId=randomUUID();await c.query('INSERT INTO supply_receipts(id,organization_id,property_id,order_id,actor_user_id,actor_membership_id) VALUES($1,$2,$3,$4,$5,$6)',[receiptId,a.organizationId,order.property_id,orderId,a.userId,a.membershipId]);
  // Stable item order; the database trigger owns all balance locks.
  for(const line of lines)await c.query("INSERT INTO supply_movements(organization_id,property_id,item_id,kind,quantity,reference,receipt_id,order_line_id,actor_user_id,actor_membership_id) VALUES($1,$2,$3,'receipt',$4,$5,$6,$7,$8,$9)",[a.organizationId,order.property_id,line.item_id,line.quantity,order.reference,receiptId,line.id,a.userId,a.membershipId]);
  await c.query("UPDATE supply_orders SET status='received' WHERE id=$1",[orderId]);
  const result={orderId,receiptId,status:'received',idempotentReplay:false};await record(c,a,order.property_id,command,'stock.manage',payload,result,'supply.order_received',receiptId);return result;
 });}catch(e){mapped(e);}}
 async issue(a:Actor,key:unknown,raw:unknown){enabled();const b=input.issue(raw),command=input.id(key),payload={type:'issue',...b};try{return await this.db.withActor(a,async c=>{
  const prior=await replay(c,a,b.propertyId,command,'stock.manage',payload);if(prior)return prior;
  if(!(await c.query('SELECT 1 FROM supply_items WHERE id=$1 AND organization_id=$2 AND property_id=$3',[b.itemId,a.organizationId,b.propertyId])).rowCount)throw new NotFoundException('SUPPLY_NOT_FOUND');
  const movementId=randomUUID();await c.query("INSERT INTO supply_movements(id,organization_id,property_id,item_id,kind,quantity,reference,actor_user_id,actor_membership_id) VALUES($1,$2,$3,$4,'issue',$5,$6,$7,$8)",[movementId,a.organizationId,b.propertyId,b.itemId,(-BigInt(b.quantity)).toString(),b.reference,a.userId,a.membershipId]);
  const remaining=(await c.query('SELECT quantity::text FROM supply_balances WHERE item_id=$1',[b.itemId])).rows[0].quantity;
  const result={movementId,itemId:b.itemId,quantity:b.quantity,remainingQuantity:remaining,idempotentReplay:false};await record(c,a,b.propertyId,command,'stock.manage',payload,result,'supply.stock_issued',movementId);return result;
 });}catch(e){mapped(e);}}
}
