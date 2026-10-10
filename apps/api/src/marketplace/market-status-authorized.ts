import type {PoolClient} from "pg";
import {idempotentMarketTerminalTransition,type MarketStatusCommand} from "../inventory/market-order-status-idempotent";

/**
 * Internal dispatcher permission gate for terminal transitions.
 * Caller MUST supply a verified actor in an active transaction.
 * No HTTP route is exposed by this function.
 */
export async function authorizedMarketTerminalTransition(
 client:Pick<PoolClient,"query">,
 input:MarketStatusCommand
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
 return idempotentMarketTerminalTransition(client,input);
}
