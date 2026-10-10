import {Injectable} from "@nestjs/common";
import {DatabaseService} from "../database/database.service";
import type {RequestActorContext} from "../identity/actor-context";

export type MarketOrderListItem={
 id:string;property_id:string;unit_id:string|null;status:string;payment_status:string;
 total_minor:string;delivery_slot:string;version:number;created_at:Date;
};
/**
 * Read-only Staff CRM service. Uses existing authenticated actor context and
 * tenant/property RLS. No write endpoint is enabled.
 */
@Injectable()
export class MarketStaffReadService{
 constructor(private readonly db:DatabaseService){}
 async listOrders(actor:RequestActorContext,propertyId:string,limit=50):Promise<MarketOrderListItem[]>{
  if(!Number.isSafeInteger(limit)||limit<1||limit>100)throw Error("INVALID_MARKET_LIMIT");
  return this.db.withActor(actor,async client=>{
   const access=await client.query<{allowed:boolean}>(
    "SELECT app.can_access_property($1::uuid) AS allowed",[propertyId]
   );
   if(!access.rows[0]?.allowed)throw Error("MARKET_PROPERTY_FORBIDDEN");
   const orders=await client.query<MarketOrderListItem>(
    `SELECT id,property_id,unit_id,status,payment_status,total_minor::text,
            delivery_slot,version,created_at
       FROM market_service_orders
      WHERE organization_id=$1 AND property_id=$2
      ORDER BY created_at DESC,id DESC LIMIT $3`,
    [actor.organizationId,propertyId,limit]
   );
   return orders.rows;
  });
 }
}
