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
 async receive(a:Actor,target:unknown,key:unknown,raw:unknown){enabled();const requested=input.receipt(raw),orderId=input.id(target),command=input.id(key),payload={type:'receive',orderId,...(requested?{lines:requested}:{})};try{return await this.db.withActor(a,async c=>{
  const initial=(await c.query('SELECT property_id FROM supply_orders WHERE id=$1 AND organization_id=$2',[orderId,a.organizationId])).rows[0];if(!initial)throw new NotFoundException('SUPPLY_NOT_FOUND');
  const prior=await replay(c,a,initial.property_id,command,'stock.manage',payload);if(prior)return prior;
  const order=(await c.query('SELECT property_id,reference,status FROM supply_orders WHERE id=$1 FOR UPDATE',[orderId])).rows[0];await access(c,a,order.property_id,'stock.manage');
  if(!['ordered','partially_received'].includes(order.status))throw new ConflictException('ORDER_ALREADY_RECEIVED');
  const lines=(await c.query<{id:string;item_id:string;quantity:string;received:string}>("SELECT l.id,l.item_id,l.quantity::text,COALESCE((SELECT sum(m.quantity) FROM supply_movements m WHERE m.order_line_id=l.id AND m.kind='receipt'),0)::text received FROM supply_order_lines l WHERE l.order_id=$1 ORDER BY l.item_id",[orderId])).rows;if(!lines.length)throw new ConflictException('SUPPLY_ORDER_EMPTY');
  if(requested?.some(r=>!lines.some(l=>l.item_id===r.itemId)))input.invalid();
  const shipment=lines.flatMap(line=>{const remaining=BigInt(line.quantity)-BigInt(line.received),selected=requested?.find(r=>r.itemId===line.item_id),quantity=requested?(selected?.quantity??'0'):remaining.toString();if(BigInt(quantity)>remaining)throw new ConflictException('RECEIPT_QUANTITY_EXCEEDED');return quantity==='0'?[]:[{...line,quantity}];});
  if(!shipment.length)throw new ConflictException('ORDER_ALREADY_RECEIVED');
  const receiptId=randomUUID();await c.query('INSERT INTO supply_receipts(id,organization_id,property_id,order_id,actor_user_id,actor_membership_id) VALUES($1,$2,$3,$4,$5,$6)',[receiptId,a.organizationId,order.property_id,orderId,a.userId,a.membershipId]);
  for(const line of shipment)await c.query('INSERT INTO supply_receipt_lines(organization_id,property_id,receipt_id,order_line_id,quantity) VALUES($1,$2,$3,$4,$5)',[a.organizationId,order.property_id,receiptId,line.id,line.quantity]);
  // Stable item order; the database trigger owns all balance locks.
  for(const line of shipment)await c.query("INSERT INTO supply_movements(organization_id,property_id,item_id,kind,quantity,reference,receipt_id,order_line_id,actor_user_id,actor_membership_id) VALUES($1,$2,$3,'receipt',$4,$5,$6,$7,$8,$9)",[a.organizationId,order.property_id,line.item_id,line.quantity,order.reference,receiptId,line.id,a.userId,a.membershipId]);
  const complete=lines.every(l=>BigInt(l.received)+BigInt(shipment.find(s=>s.id===l.id)?.quantity??'0')===BigInt(l.quantity)),status=complete?'received':'partially_received';
  await c.query('UPDATE supply_orders SET status=$2 WHERE id=$1',[orderId,status]);
  const result={orderId,receiptId,status,idempotentReplay:false};await record(c,a,order.property_id,command,'stock.manage',payload,result,'supply.order_received',receiptId);return result;
 });}catch(e){mapped(e);}}
 async issue(a:Actor,key:unknown,raw:unknown){enabled();const b=input.issue(raw),command=input.id(key),payload={type:'issue',...b};try{return await this.db.withActor(a,async c=>{
  const prior=await replay(c,a,b.propertyId,command,'stock.manage',payload);if(prior)return prior;
  if(!(await c.query('SELECT 1 FROM supply_items WHERE id=$1 AND organization_id=$2 AND property_id=$3',[b.itemId,a.organizationId,b.propertyId])).rowCount)throw new NotFoundException('SUPPLY_NOT_FOUND');
  const movementId=randomUUID();await c.query("INSERT INTO supply_movements(id,organization_id,property_id,item_id,kind,quantity,reference,actor_user_id,actor_membership_id) VALUES($1,$2,$3,$4,'issue',$5,$6,$7,$8)",[movementId,a.organizationId,b.propertyId,b.itemId,(-BigInt(b.quantity)).toString(),b.reference,a.userId,a.membershipId]);
  const remaining=(await c.query('SELECT quantity::text FROM supply_balances WHERE item_id=$1',[b.itemId])).rows[0].quantity;
  const result={movementId,itemId:b.itemId,quantity:b.quantity,remainingQuantity:remaining,idempotentReplay:false};await record(c,a,b.propertyId,command,'stock.manage',payload,result,'supply.stock_issued',movementId);return result;
 });}catch(e){mapped(e);}}
}
