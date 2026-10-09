import {describe,it,expect,vi} from "vitest";
import {executeMarketIdempotentCommand} from "./market-command-idempotency";
const input={organizationId:"org",orderId:"order",commandType:"assignment" as const,idempotencyKey:"key",request:{assignee:"staff",version:1}};
describe("market idempotent command",()=>{
 it("executes once, then stores result in same transaction",async()=>{
  const calls:string[]=[];
  const query=vi.fn(async(sql:string)=>{calls.push(sql);return {rows:[],rowCount:1}});
  const execute=vi.fn(async()=>({orderId:"order",version:2}));
  const out=await executeMarketIdempotentCommand({query} as never,input,execute);
  expect(out).toEqual({result:{orderId:"order",version:2},replayed:false});
  expect(execute).toHaveBeenCalledTimes(1);
  expect(calls[0]).toContain("pg_advisory_xact_lock");
  expect(calls.at(-1)).toContain("INSERT INTO market_command_idempotency");
 });
 it("rejects a changed replay before command execution",async()=>{
  const query=vi.fn(async(sql:string)=>{
   if(sql.includes("SELECT request_hash"))return {rows:[{request_hash:"different",order_id:"order",result:{version:2}}]};
   return {rows:[]};
  });
  const execute=vi.fn(async()=>({version:3}));
  await expect(executeMarketIdempotentCommand({query} as never,input,execute)).rejects.toThrow("MARKET_IDEMPOTENCY_CONFLICT");
  expect(execute).not.toHaveBeenCalled();
 });
 it("rejects invalid key before any query",async()=>{
  const query=vi.fn();
  await expect(executeMarketIdempotentCommand({query} as never,{...input,idempotencyKey:" "},async()=>({}))).rejects.toThrow("INVALID_MARKET_IDEMPOTENCY_KEY");
  expect(query).not.toHaveBeenCalled();
 });
});
