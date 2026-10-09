import {createHash} from "node:crypto";
import type {PoolClient} from "pg";

export type MarketCommandType="assignment"|"status";
export type MarketIdempotentCommand={
 organizationId:string;
 orderId:string;
 commandType:MarketCommandType;
 idempotencyKey:string;
 request:unknown;
};
/**
 * Invoke ONLY inside a caller-owned PostgreSQL transaction with authenticated
 * tenant/property permissions and a non-bypass-RLS actor. The callback must
 * execute the command and its audit event on the SAME client/transaction.
 * A transaction rollback also rolls back this idempotency record.
 */
export async function executeMarketIdempotentCommand<T extends Record<string,unknown>>(
 client:Pick<PoolClient,"query">,
 input:MarketIdempotentCommand,
 execute:()=>Promise<T>
):Promise<{result:T;replayed:boolean}>{
 if(!input.idempotencyKey.trim()||input.idempotencyKey.length>160)throw Error("INVALID_MARKET_IDEMPOTENCY_KEY");
 if(!input.organizationId||!input.orderId||!["assignment","status"].includes(input.commandType))throw Error("INVALID_MARKET_COMMAND");
 const hash=createHash("sha256").update(JSON.stringify({orderId:input.orderId,request:input.request})).digest("hex");
 // Serialize contenders for the same organization, command type and key.
 await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[
  input.organizationId+":"+input.commandType+":"+input.idempotencyKey
 ]);
 const existing=await client.query<{request_hash:string;order_id:string|null;result:T|null}>(
  `SELECT request_hash,order_id,result FROM market_command_idempotency
   WHERE organization_id=$1 AND command_type=$2 AND idempotency_key=$3`,
  [input.organizationId,input.commandType,input.idempotencyKey]
 );
 if(existing.rows[0]){
  const prior=existing.rows[0];
  if(prior.request_hash!==hash||prior.order_id!==input.orderId)throw Error("MARKET_IDEMPOTENCY_CONFLICT");
  if(prior.result===null)throw Error("MARKET_IDEMPOTENCY_INCOMPLETE");
  return {result:prior.result,replayed:true};
 }
 const result=await execute();
 await client.query(
  `INSERT INTO market_command_idempotency
    (organization_id,command_type,idempotency_key,request_hash,order_id,result)
    VALUES($1,$2,$3,$4,$5,$6::jsonb)`,
  [input.organizationId,input.commandType,input.idempotencyKey,hash,input.orderId,JSON.stringify(result)]
 );
 return {result,replayed:false};
}
