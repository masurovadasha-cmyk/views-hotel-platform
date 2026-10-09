import type {PoolClient} from "pg";
import {validateMarketAssignee} from "./market-assignee-access";

export type MarketAssignmentCommand={
 organizationId:string;propertyId:string;orderId:string;
 actorMembershipId:string;assigneeMembershipId:string;
 priority:"normal"|"high"|"urgent";dueAt:string;expectedVersion:number;
};
/**
 * Execute inside an authenticated, authorized DatabaseService.withActor transaction.
 * The caller must verify dispatcher permissions for the order property.
 * No HTTP endpoint is exposed by this module.
 */
export async function assignMarketOrderInTransaction(client:Pick<PoolClient,"query">,input:MarketAssignmentCommand){
 if(!Number.isSafeInteger(input.expectedVersion)||input.expectedVersion<1)throw Error("INVALID_ORDER_VERSION");
 if(!["normal","high","urgent"].includes(input.priority)||!Number.isFinite(Date.parse(input.dueAt))||Date.parse(input.dueAt)<=Date.now())throw Error("INVALID_MARKET_SLA");
 const orderResult=await client.query<{property_id:string;status:string;version:number}>(
  `SELECT property_id,status,version FROM market_service_orders
    WHERE id=$1 AND organization_id=$2 FOR UPDATE`,
  [input.orderId,input.organizationId]
 );
 const order=orderResult.rows[0];
 if(!order||order.property_id!==input.propertyId)throw Error("MARKET_ORDER_NOT_FOUND");
 if(order.status==="cancelled"||order.status==="delivered")throw Error("MARKET_ORDER_TERMINAL");
 if(order.version!==input.expectedVersion)throw Error("MARKET_VERSION_CONFLICT");
 await validateMarketAssignee(client,{organizationId:input.organizationId,propertyId:input.propertyId,assigneeMembershipId:input.assigneeMembershipId});
 await client.query(
  `INSERT INTO market_service_assignments(
    organization_id,order_id,assignee_membership_id,priority,due_at,assigned_by_membership_id)
    VALUES($1,$2,$3,$4,$5,$6)
    ON CONFLICT(order_id) DO UPDATE SET
      assignee_membership_id=EXCLUDED.assignee_membership_id,
      priority=EXCLUDED.priority,due_at=EXCLUDED.due_at,
      assigned_by_membership_id=EXCLUDED.assigned_by_membership_id,
      assigned_at=now()`,
  [input.organizationId,input.orderId,input.assigneeMembershipId,input.priority,input.dueAt,input.actorMembershipId]
 );
 const updated=await client.query(
  `UPDATE market_service_orders SET version=version+1,updated_at=now()
    WHERE id=$1 AND organization_id=$2 AND version=$3`,
  [input.orderId,input.organizationId,input.expectedVersion]
 );
 if(updated.rowCount!==1)throw Error("MARKET_VERSION_CONFLICT");
 await client.query(
  `INSERT INTO market_service_events(organization_id,order_id,actor_membership_id,action,details)
    VALUES($1,$2,$3,'assigned',$4::jsonb)`,
  [input.organizationId,input.orderId,input.actorMembershipId,JSON.stringify({assigneeMembershipId:input.assigneeMembershipId,priority:input.priority,dueAt:input.dueAt})]
 );
 return {orderId:input.orderId,version:input.expectedVersion+1,assigneeMembershipId:input.assigneeMembershipId};
}
