import {ConflictException,Injectable,NotFoundException} from '@nestjs/common';
import {randomUUID} from 'node:crypto';
import {DatabaseService} from '../database/database.service';
import {id} from './supply.input';
import {stocktakeConfirm,stocktakePreview} from './supply-stocktake.input';
import {access,enabled,mapped,record,replay,type Actor} from './supply.store';
export type StocktakeReceipt={stocktakeId:string;movementId:string;propertyId:string;itemId:string;quantity:string;deltaQuantity:string;remainingQuantity:string;idempotentReplay:boolean};
@Injectable()
export class SupplyStocktakeService{
 constructor(private readonly db:DatabaseService){}
 async preview(a:Actor,raw:unknown){enabled();const b=stocktakePreview(raw);return this.db.withActor(a,async c=>{
  await access(c,a,b.propertyId,'stock.manage');
  const item=(await c.query<{sku:string;name:string;unit:string;expectedQuantity:string;expectedRevision:string}>(`SELECT i.sku,i.name,i.unit,COALESCE(b.quantity,0)::text AS "expectedQuantity",COALESCE(b.revision,0)::text AS "expectedRevision" FROM supply_items i LEFT JOIN supply_balances b ON b.item_id=i.id WHERE i.id=$1 AND i.organization_id=$2 AND i.property_id=$3`,[b.itemId,a.organizationId,b.propertyId])).rows[0];
  if(!item)throw new NotFoundException('SUPPLY_NOT_FOUND');
  return {...b,...item,deltaQuantity:(BigInt(b.countedQuantity)-BigInt(item.expectedQuantity)).toString()};
 });}
 async confirm(a:Actor,key:unknown,raw:unknown):Promise<StocktakeReceipt>{enabled();const b=stocktakeConfirm(raw),command=id(key),payload={type:'stocktake',...b};try{return await this.db.withActor(a,async c=>{
  const prior=await replay(c,a,b.propertyId,command,'stock.manage',payload);if(prior)return prior as StocktakeReceipt;
  if(!(await c.query('SELECT 1 FROM supply_items WHERE id=$1 AND organization_id=$2 AND property_id=$3',[b.itemId,a.organizationId,b.propertyId])).rowCount)throw new NotFoundException('SUPPLY_NOT_FOUND');
  const stocktakeId=randomUUID(),movementId=randomUUID(),deltaQuantity=(BigInt(b.countedQuantity)-BigInt(b.expectedQuantity)).toString();
  // The insert trigger locks the same stable item row as receipts/issues and
  // rechecks both quantity and movement revision before recording the count.
  await c.query('INSERT INTO supply_stocktakes(id,organization_id,property_id,item_id,expected_quantity,counted_quantity,expected_revision,reason,actor_user_id,actor_membership_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[stocktakeId,a.organizationId,b.propertyId,b.itemId,b.expectedQuantity,b.countedQuantity,b.expectedRevision,b.reason,a.userId,a.membershipId]);
  await c.query("INSERT INTO supply_movements(id,organization_id,property_id,item_id,kind,quantity,reference,stocktake_id,actor_user_id,actor_membership_id) VALUES($1,$2,$3,$4,'adjustment',$5,$6,$7,$8,$9)",[movementId,a.organizationId,b.propertyId,b.itemId,deltaQuantity,b.reason,stocktakeId,a.userId,a.membershipId]);
  const result:StocktakeReceipt={stocktakeId,movementId,propertyId:b.propertyId,itemId:b.itemId,quantity:b.countedQuantity,deltaQuantity,remainingQuantity:b.countedQuantity,idempotentReplay:false};
  await record(c,a,b.propertyId,command,'stock.manage',payload,result,'supply.stocktake_recorded',stocktakeId);return result;
 });}catch(e){if((e as {code?:string}).code==='40001')throw new ConflictException('STOCKTAKE_STALE');mapped(e);}}
}
