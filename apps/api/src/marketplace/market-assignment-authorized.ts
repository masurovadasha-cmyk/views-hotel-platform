import type {PoolClient} from "pg";
import {assignMarketOrderInTransaction,type MarketAssignmentCommand} from "./market-assignment-transaction";

/** Server-side authorization gate for staff assignment commands.
 * Must execute within a trusted actor transaction; no public controller yet.
 */
export async function authorizedMarketAssignment(
 client:Pick<PoolClient,"query">,
 input:MarketAssignmentCommand
){
 const permission=await client.query<{allowed:boolean}>(
  `SELECT EXISTS(
    SELECT 1 FROM organization_memberships m
    JOIN roles r ON r.id=m.role_id
    WHERE m.id=$1 AND m.organization_id=$2 AND m.status='active'
      AND r.code IN ('owner','manager','front_desk','concierge','platform_admin')
      AND app.can_access_property($3::uuid)
  ) AS allowed`,
  [input.actorMembershipId,input.organizationId,input.propertyId]
 );
 if(!permission.rows[0]?.allowed)throw Error("MARKET_DISPATCHER_FORBIDDEN");
 return assignMarketOrderInTransaction(client,input);
}
