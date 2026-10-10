import test from "node:test";import assert from "node:assert/strict";
import {createViewsClient} from "../public/views-client.js";
test("client requires authentication provider",()=>assert.throws(()=>createViewsClient({}),/getToken/));
test("client rejects absent token before network call",async()=>{
 const client=createViewsClient({getToken:async()=>""});
 await assert.rejects(client.listOrders(),/Sign-in required/);
});
test("client sends bearer token and PATCH body",async()=>{
 const original=globalThis.fetch;let captured;
 globalThis.fetch=async(url,options)=>{captured={url,options};return {ok:true,json:async()=>({id:"order-1",fulfillmentStatus:"assigned"})}};
 try{
  const client=createViewsClient({getToken:async()=>"test-signed-token"});
  const result=await client.changeStatus("order-1","assigned");
  assert.equal(result.fulfillmentStatus,"assigned");
  assert.equal(captured.options.headers.Authorization,"Bearer test-signed-token");
  assert.equal(JSON.parse(captured.options.body).fulfillmentStatus,"assigned");
  assert.equal(captured.options.credentials,"omit");
 }finally{globalThis.fetch=original}
});

test("client loads tenant market inventory through the authenticated API",async()=>{
 const original=globalThis.fetch;let captured;
 globalThis.fetch=async(url,options)=>{captured={url,options};return {ok:true,json:async()=>[{sku:"WATER-15",available:4}]}};
 try{
  const client=createViewsClient({getToken:async()=>"staff-session"});
  assert.deepEqual(await client.listMarketInventory(),[{sku:"WATER-15",available:4}]);
  assert.equal(captured.url,"/api/v1/market/inventory");
  assert.equal(captured.options.headers.Authorization,"Bearer staff-session");
 }finally{globalThis.fetch=original}
});

test("client requests verified identity from server instead of browser claims",async()=>{
 const original=globalThis.fetch;let url;
 globalThis.fetch=async(path)=>{url=path;return {ok:true,json:async()=>({sub:"staff-1",organizationId:"tenant",roles:["staff"]})}};
 try{
  const client=createViewsClient({getToken:async()=>"test-signed-token"});
  const session=await client.getSession();
  assert.equal(url,"/api/v1/me");
  assert.deepEqual(session.roles,["staff"]);
 }finally{globalThis.fetch=original}
});
