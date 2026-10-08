import {Injectable} from '@nestjs/common';
import {DatabaseService} from '../database/database.service';
import {cursor,id,next} from './supply.input';
import {access,enabled,type Actor} from './supply.store';
@Injectable()
export class SupplyReadService{
 constructor(private readonly db:DatabaseService){}
 async properties(a:Actor,raw?:unknown){enabled();const bound='supply-properties:'+a.organizationId,after=cursor(raw,bound);return this.db.withActor(a,async c=>{const rows=(await c.query('SELECT id,name,timezone FROM properties WHERE organization_id=$1 AND app.registry_access(organization_id,id,\'supply.read\') AND ($2::uuid IS NULL OR id>$2) ORDER BY id LIMIT 51',[a.organizationId,after])).rows;return {items:rows.slice(0,50),nextCursor:rows.length>50?next(bound,rows[49].id):null};});}
 async list(a:Actor,kind:'items'|'stock'|'orders'|'movements',property:unknown,raw?:unknown){enabled();const p=id(property),bound='supply:'+kind+':'+a.organizationId+':'+p,after=cursor(raw,bound),size=kind==='orders'?10:50;return this.db.withActor(a,async c=>{
  await access(c,a,p);
  const sql=kind==='items'?`SELECT id,sku,name,unit FROM supply_items WHERE organization_id=$1 AND property_id=$2 AND ($3::uuid IS NULL OR id>$3) ORDER BY id LIMIT 51`:
   kind==='stock'?`SELECT i.id AS "itemId",i.sku,i.name,i.unit,COALESCE(b.quantity,0)::text quantity FROM supply_items i LEFT JOIN supply_balances b ON b.item_id=i.id WHERE i.organization_id=$1 AND i.property_id=$2 AND ($3::uuid IS NULL OR i.id>$3) ORDER BY i.id LIMIT 51`:
   kind==='orders'?`SELECT o.id,o.reference,o.status,o.created_at AS "createdAt",COALESCE((SELECT jsonb_agg(jsonb_build_object('itemId',i.id,'sku',i.sku,'name',i.name,'unit',i.unit,'quantity',l.quantity::text,'receivedQuantity',received.quantity::text,'remainingQuantity',(l.quantity-received.quantity)::text) ORDER BY i.id) FROM supply_order_lines l JOIN supply_items i ON i.id=l.item_id CROSS JOIN LATERAL (SELECT COALESCE(sum(m.quantity),0) quantity FROM supply_movements m WHERE m.order_line_id=l.id AND m.kind='receipt') received WHERE l.order_id=o.id),'[]') lines FROM supply_orders o WHERE o.organization_id=$1 AND o.property_id=$2 AND ($3::uuid IS NULL OR o.id>$3) ORDER BY o.id LIMIT 11`:
   `SELECT m.id,m.item_id AS "itemId",i.sku,i.name,i.unit,m.kind,m.quantity::text,m.reference,m.created_at AS "createdAt" FROM supply_movements m JOIN supply_items i ON i.id=m.item_id WHERE m.organization_id=$1 AND m.property_id=$2 AND ($3::uuid IS NULL OR m.id>$3) ORDER BY m.id LIMIT 51`;
  const rows=(await c.query(sql,[a.organizationId,p,after])).rows;return {items:rows.slice(0,size),nextCursor:rows.length>size?next(bound,rows[size-1].id??rows[size-1].itemId):null};
 });}
}
