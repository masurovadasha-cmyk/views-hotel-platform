import {afterAll,beforeAll,describe,it,expect} from "vitest";
import {Pool} from "pg";
import {reserveMarketStock} from "./market-stock-transaction";

const ORG="00000000-0000-0000-0000-000000000001";
const PROPERTY="00000000-0000-0000-0000-000000000002";
const actorUserId="20000000-0000-4000-8000-000000000001";
const pool=new Pool({connectionString:process.env.MARKET_TEST_ADMIN_DATABASE_URL||process.env.DATABASE_URL});
async function transaction<T>(work:(client:import("pg").PoolClient)=>Promise<T>):Promise<T>{
 const client=await pool.connect();
 try{await client.query("BEGIN");const result=await work(client);await client.query("COMMIT");return result}
 catch(error){await client.query("ROLLBACK");throw error}finally{client.release()}
}
const SKU="CI-CONCURRENT-MARKET";
const adminEnabled=!!process.env.MARKET_TEST_ADMIN_DATABASE_URL;

beforeAll(async()=>{
 if(!adminEnabled)return;
 await transaction(async client=>{
  await client.query(`INSERT INTO market_stock_balances(organization_id,property_id,sku,on_hand,reserved)
    VALUES($1,$2,$3,1,0) ON CONFLICT(organization_id,property_id,sku)
    DO UPDATE SET on_hand=1,reserved=0`,[ORG,PROPERTY,SKU]);
  await client.query(`INSERT INTO market_service_orders(id,organization_id,property_id,actor_user_id,idempotency_key,request_hash,subtotal_minor,delivery_slot)
    VALUES('70000000-0000-4000-8000-000000000001',$1,$2,$3,'stock-test-1',repeat('a',64),0,'now'),
          ('70000000-0000-4000-8000-000000000002',$1,$2,$3,'stock-test-2',repeat('b',64),0,'now')
    ON CONFLICT(organization_id,idempotency_key) DO NOTHING`,[ORG,PROPERTY,actorUserId]);
 });
});
afterAll(async()=>{await pool.end()});
(adminEnabled?describe.sequential:describe.skip)("market stock PostgreSQL concurrency",()=>{
 it("only one of two simultaneous reservations obtains the last unit",async()=>{
  const results=await Promise.allSettled([1,2].map(i=>transaction(client=>reserveMarketStock(client,{
   organizationId:ORG,propertyId:PROPERTY,orderId:`70000000-0000-4000-8000-00000000000${i}`,lines:[{sku:SKU,quantity:1}]
  }))));
  expect(results.filter(r=>r.status==="fulfilled")).toHaveLength(1);
  expect(results.filter(r=>r.status==="rejected")).toHaveLength(1);
  const result=await transaction(client=>client.query<{on_hand:number;reserved:number}>(
   "SELECT on_hand,reserved FROM market_stock_balances WHERE organization_id=$1 AND property_id=$2 AND sku=$3",[ORG,PROPERTY,SKU]
  ));
  expect(result.rows[0]).toMatchObject({on_hand:1,reserved:1});
 });
});
