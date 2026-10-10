import test from "node:test";import assert from "node:assert/strict";
import {inTenantTransaction,reserveFefo} from "../src/postgres.mjs";
test("tenant transaction commits and releases",async()=>{
 const calls=[];const client={query:async(sql)=>{calls.push(sql);return {rows:[],rowCount:0}},release:()=>calls.push("release")};
 await inTenantTransaction({connect:async()=>client},"11111111-1111-4111-8111-111111111111",async()=>42);
 assert.deepEqual(calls.slice(0,2),["BEGIN","SELECT set_config('app.organization_id', $1, true)"]);
 assert.equal(calls.at(-2),"COMMIT");assert.equal(calls.at(-1),"release");
});
test("tenant transaction rolls back on error",async()=>{
 const calls=[];const client={query:async(sql)=>{calls.push(sql);return {rows:[]}},release:()=>calls.push("release")};
 await assert.rejects(inTenantTransaction({connect:async()=>client},"11111111-1111-4111-8111-111111111111",async()=>{throw Error("fail")}),/fail/);
 assert.equal(calls.at(-2),"ROLLBACK");
});
test("FEFO reservations generate stock movements",async()=>{
 const calls=[];const client={query:async(sql,args)=>{calls.push({sql,args});if(sql.startsWith("SELECT id,on_hand"))return {rows:[{id:"lot-1",on_hand:5,reserved:1}]};return {rows:[],rowCount:1}}};
 const result=await reserveFefo(client,{organizationId:"org",orderId:"order",sku:"MILK-1",quantity:3,asOf:"2026-10-09"});
 assert.deepEqual(result,[{lotId:"lot-1",quantity:3}]);assert.equal(calls.filter(x=>x.sql.startsWith("INSERT INTO stock_movements")).length,1);
});
test("insufficient stock rejects for transaction rollback",async()=>{
 const client={query:async(sql)=>sql.startsWith("SELECT id,on_hand")?{rows:[]}:{rows:[]}};
 await assert.rejects(reserveFefo(client,{organizationId:"org",orderId:"order",sku:"MILK-1",quantity:2,asOf:"2026-10-09"}),/Insufficient/);
});
