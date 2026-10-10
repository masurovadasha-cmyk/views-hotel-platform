import type {PoolClient} from "pg";
import {idempotentMarketTerminalTransition,type MarketStatusCommand} from "../inventory/market-order-status-idempotent";
import {assertMarketDispatcherPermission} from "./market-assignment-authorized";

/**
 * Internal dispatcher permission gate for terminal transitions.
 * Caller MUST supply a verified actor in an active transaction.
 * No HTTP route is exposed by this function.
 */
export async function authorizedMarketTerminalTransition(
 client:Pick<PoolClient,"query">,
 input:MarketStatusCommand
){
 await assertMarketDispatcherPermission(client,input);
 return idempotentMarketTerminalTransition(client,input);
}
