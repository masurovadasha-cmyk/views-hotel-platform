import type {PoolClient} from "pg";
import {finalizeMarketStock,type MarketTerminalAction} from "./market-stock-finalize";

/**
 * Must be called inside DatabaseService.withActor (BEGIN/COMMIT/ROLLBACK).
 * The caller must have an authenticated actor and property-scoped authorization.
 * This function is NOT exposed by any HTTP controller.
 */
export async function transitionMarketOrder(
 client:Pick<PoolClient,"query">,
 input:{organizationId:string;propertyId:string;orderId:string;expectedVersion:number;action:MarketTerminalAction;actorMembershipId:string}
){
 if(!Number.isSafeInteger(input.expectedVersion)||input.expectedVersion<1)throw Error("INVALID_ORDER_VERSION");
 const result=await client.query<{status:string;version:number;property_id:string}>(
  `SELECT status,version,property_id FROM market_service_orders
     WHERE id=$1 AND organization_id=$2 FOR UPDATE`,
  [input.orderId,input.organizationId]
 );
 const order=result.rows[0];
 if(!order||order.property_id!==input.propertyId)throw Error("MARKET_ORDER_NOT_FOUND");
 if(order.version!==input.expectedVersion)throw Error("MARKET_VERSION_CONFLICT");
 if(order.status==="delivered"||order.status==="cancelled")throw Error("MARKET_ORDER_TERMINAL");
 if(input.action==="delivered"&&order.status!=="out_for_delivery")throw Error("INVALID_ORDER_TRANSITION");
 const lines=await client.query<{sku:string;quantity:number}>(
  `SELECT sku,quantity FROM market_service_order_lines
    WHERE organization_id=$1 AND order_id=$2 ORDER BY sku`,
  [input.organizationId,input.orderId]
 );
 if(!lines.rows.length)throw Error("MARKET_ORDER_LINES_MISSING");
 await finalizeMarketStock(client,{organizationId:input.organizationId,propertyId:input.propertyId,orderId:input.orderId,action:input.action,lines:lines.rows});
 const updated=await client.query(
  `UPDATE market_service_orders SET status=$1,version=version+1,updated_at=now()
    WHERE id=$2 AND organization_id=$3 AND version=$4`,
  [input.action,input.orderId,input.organizationId,input.expectedVersion]
 );
 if(updated.rowCount!==1)throw Error("MARKET_VERSION_CONFLICT");
 await client.query(
  `INSERT INTO market_service_events(organization_id,order_id,actor_membership_id,action,details)
    VALUES($1,$2,$3,$4,$5::jsonb)`,
  [input.organizationId,input.orderId,input.actorMembershipId,input.action,JSON.stringify({previousStatus:order.status})]
 );
 return {orderId:input.orderId,status:input.action,version:input.expectedVersion+1};
}
