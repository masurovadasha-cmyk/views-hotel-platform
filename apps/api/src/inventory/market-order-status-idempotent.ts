import type {PoolClient} from "pg";
import {executeMarketIdempotentCommand} from "../marketplace/market-command-idempotency";
import {transitionMarketOrder} from "./market-order-transition";
import type {MarketTerminalAction} from "./market-stock-finalize";

export type MarketStatusCommand={
 organizationId:string;propertyId:string;orderId:string;
 expectedVersion:number;action:MarketTerminalAction;
 actorMembershipId:string;idempotencyKey:string;
};

/**
 * Internal-only command. The caller must provide an authenticated actor and
 * authorize the requested transition for this property before invocation.
 * All operations run in the caller's BEGIN/COMMIT transaction.
 */
export async function idempotentMarketTerminalTransition(
 client:Pick<PoolClient,"query">,
 input:MarketStatusCommand
){
 return executeMarketIdempotentCommand(client,{
  organizationId:input.organizationId,
  orderId:input.orderId,
  commandType:"status",
  idempotencyKey:input.idempotencyKey,
  request:{
   propertyId:input.propertyId,
   action:input.action,
   expectedVersion:input.expectedVersion,
   actorMembershipId:input.actorMembershipId
  }
 },()=>transitionMarketOrder(client,input));
}
