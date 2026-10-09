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
 async orderDetail(actor:RequestActorContext,propertyId:string,orderId:string){
  return this.db.withActor(actor,async client=>{
   const access=await client.query<{allowed:boolean}>("SELECT app.can_access_property($1::uuid) AS allowed",[propertyId]);
   if(!access.rows[0]?.allowed)throw Error("MARKET_PROPERTY_FORBIDDEN");
   const role=await client.query<{allowed:boolean}>(
    `SELECT EXISTS(
       SELECT 1 FROM organization_memberships m JOIN roles r ON r.id=m.role_id
       WHERE m.id=$1 AND m.user_id=$2 AND m.organization_id=$3
         AND m.status='active'
         AND r.code IN ('owner','manager','front_desk','concierge','platform_admin')
     ) AS allowed`,
    [actor.membershipId,actor.userId,actor.organizationId]
   );
   if(!role.rows[0]?.allowed)throw Error("MARKET_ROLE_FORBIDDEN");
   const result=await client.query(
    `SELECT id,property_id,unit_id,status,payment_status,total_minor::text,
            subtotal_minor::text,delivery_minor::text,delivery_slot,guest_comment,
            version,created_at,updated_at
       FROM market_service_orders
      WHERE organization_id=$1 AND property_id=$2 AND id=$3`,
    [actor.organizationId,propertyId,orderId]
   );
   const order=result.rows[0];if(!order)throw Error("MARKET_ORDER_NOT_FOUND");
   const [lines,assignment,events]=await Promise.all([
    client.query(
     `SELECT sku,product_name_snapshot,quantity,unit_price_minor::text,line_total_minor::text
        FROM market_service_order_lines WHERE organization_id=$1 AND order_id=$2 ORDER BY sku`,
     [actor.organizationId,orderId]
    ),
    client.query(
     `SELECT assignee_membership_id,priority,due_at,assigned_at
        FROM market_service_assignments WHERE organization_id=$1 AND order_id=$2`,
     [actor.organizationId,orderId]
    ),
    client.query(
     `SELECT id,action,details,actor_membership_id,created_at
        FROM market_service_events WHERE organization_id=$1 AND order_id=$2
        ORDER BY id ASC LIMIT 200`,
     [actor.organizationId,orderId]
    )
   ]);
   return {order,lines:lines.rows,assignment:assignment.rows[0]??null,events:events.rows};
  });
 }
 async listOrders(actor:RequestActorContext,propertyId:string,limit=50):Promise<MarketOrderListItem[]>{
  if(!Number.isSafeInteger(limit)||limit<1||limit>100)throw Error("INVALID_MARKET_LIMIT");
  return this.db.withActor(actor,async client=>{
   const access=await client.query<{allowed:boolean}>(
    "SELECT app.can_access_property($1::uuid) AS allowed",[propertyId]
   );
   if(!access.rows[0]?.allowed)throw Error("MARKET_PROPERTY_FORBIDDEN");
   // Property scope alone does not authorize staff CRM access: require an
   // active membership and an approved operational role inside the transaction.
   const role=await client.query<{allowed:boolean}>(
    `SELECT EXISTS(
       SELECT 1 FROM organization_memberships m
       JOIN roles r ON r.id=m.role_id
       WHERE m.id=$1 AND m.user_id=$2 AND m.organization_id=$3
         AND m.status='active'
         AND r.code IN ('owner','manager','front_desk','concierge','platform_admin')
     ) AS allowed`,
    [actor.membershipId,actor.userId,actor.organizationId]
   );
   if(!role.rows[0]?.allowed)throw Error("MARKET_ROLE_FORBIDDEN");
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
