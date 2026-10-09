import type {PoolClient} from "pg";
import {executeMarketIdempotentCommand} from "./market-command-idempotency";
import {authorizedMarketAssignment} from "./market-assignment-authorized";
import type {MarketAssignmentCommand} from "./market-assignment-transaction";

/** Run inside DatabaseService.withActor, with the caller's trusted context. */
export async function idempotentMarketAssignment(
 client:Pick<PoolClient,"query">,
 input:MarketAssignmentCommand & {idempotencyKey:string}
){
 return executeMarketIdempotentCommand(client,{
  organizationId:input.organizationId,orderId:input.orderId,
  commandType:"assignment",idempotencyKey:input.idempotencyKey,
  request:{
   propertyId:input.propertyId,
   actorMembershipId:input.actorMembershipId,
   assigneeMembershipId:input.assigneeMembershipId,
   priority:input.priority,dueAt:input.dueAt,expectedVersion:input.expectedVersion
  }
 },()=>authorizedMarketAssignment(client,input));
}
