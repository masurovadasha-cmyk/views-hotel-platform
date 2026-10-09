import {readFile} from "node:fs/promises";
import {createServer} from "node:http";
import {Pool} from "pg";
import {verifySignedContext,requireRole} from "./auth.mjs";
import {createMarketOrder,inTenantTransaction} from "./postgres.mjs";
import {changeOrderStatus} from "./order-status.mjs";

export const pool=new Pool({connectionString:process.env.DATABASE_URL,max:10,connectionTimeoutMillis:5000});
const secret=process.env.VIEWS_AUTH_SECRET;
if(!process.env.DATABASE_URL||!secret||secret.length<32)throw Error("DATABASE_URL and VIEWS_AUTH_SECRET (32+ chars) required");
const reply=(res,status,data)=>{res.writeHead(status,{"content-type":"application/json; charset=utf-8","cache-control":"no-store"});res.end(JSON.stringify(data))};
async function parse(req){let text="";for await(const chunk of req){text+=chunk;if(text.length>32768)throw Object.assign(Error("Payload too large"),{status:413})}try{return JSON.parse(text)}catch{throw Object.assign(Error("Invalid JSON"),{status:400})}}
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const server=createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,"http://localhost");
  const staticFiles={"/crm":{file:"crm.html",type:"text/html; charset=utf-8"},"/crm.css":{file:"crm.css",type:"text/css; charset=utf-8"},"/crm.js":{file:"crm.js",type:"text/javascript; charset=utf-8"},"/views-client.js":{file:"views-client.js",type:"text/javascript; charset=utf-8"}};
  if(req.method==="GET"&&staticFiles[url.pathname]){
   const entry=staticFiles[url.pathname];
   const data=await readFile(new URL("../public/"+entry.file,import.meta.url));
   res.writeHead(200,{"content-type":entry.type,"cache-control":"no-store","content-security-policy":"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'"});
   return res.end(data);
  }
  if(req.method==="GET"&&url.pathname==="/health"){await pool.query("SELECT 1");return reply(res,200,{status:"ok",mode:"postgres"})}
  const bearer=/^Bearer (.+)$/.exec(req.headers.authorization||"");
  if(!bearer)return reply(res,401,{error:"Unauthorized"});
  let context;try{context=verifySignedContext(bearer[1],secret)}catch{return reply(res,401,{error:"Unauthorized"})}
  if(!uuid.test(context.organizationId))return reply(res,401,{error:"Unauthorized"});
  if(req.method==="POST"&&url.pathname==="/api/v1/service-orders"){
   requireRole(context,["guest","dispatcher","admin"]);
   const key=req.headers["idempotency-key"];
   const body=await parse(req);
   if(typeof key!=="string"||key.length<8||key.length>128)return reply(res,400,{error:"Valid Idempotency-Key required"});
   if(!body||typeof body!=="object"||!uuid.test(body.propertyId))return reply(res,422,{error:"Invalid property"});
   const order=await createMarketOrder(pool,{organizationId:context.organizationId,propertyId:body.propertyId,idempotencyKey:key,items:body.items,principalId:context.sub,asOf:new Date().toISOString().slice(0,10)});
   return reply(res,order.replayed?200:201,order);
  }
  if(req.method==="GET"&&url.pathname==="/api/v1/service-orders"){
   requireRole(context,["dispatcher","admin"]);
   const orders=await inTenantTransaction(pool,context.organizationId,async client=>(await client.query("SELECT id,property_id,service_type,fulfillment_status,payment_status,created_at FROM service_orders ORDER BY created_at DESC LIMIT 100")).rows);
   return reply(res,200,orders);
  }
  const match=url.pathname.match(/^\/api\/v1\/service-orders\/([0-9a-f-]+)$/i);
  if(req.method==="PATCH"&&match&&uuid.test(match[1])){
   requireRole(context,["dispatcher","admin"]);
   const body=await parse(req);
   if(!body||typeof body!=="object"||typeof body.fulfillmentStatus!=="string")return reply(res,422,{error:"Invalid status"});
   const changed=await changeOrderStatus(pool,{organizationId:context.organizationId,orderId:match[1],actorId:context.sub,nextStatus:body.fulfillmentStatus});
   return reply(res,200,changed);
  }
  if(req.method==="GET"&&match&&uuid.test(match[1])){
   requireRole(context,["dispatcher","admin"]);
   const rows=await inTenantTransaction(pool,context.organizationId,async client=>(await client.query("SELECT id,property_id,service_type,fulfillment_status,payment_status,created_at FROM service_orders WHERE id=$1",[match[1]])).rows);
   return rows.length?reply(res,200,rows[0]):reply(res,404,{error:"Not found"});
  }
  return reply(res,404,{error:"Not found"});
 }catch(error){
  const status=error.message==="Forbidden"?403:error.message==="Idempotency conflict"?409:error.message==="Insufficient inventory"?409:error.message==="Invalid transition"?409:error.message==="Inventory consistency error"?409:error.message==="Not found"?404:error.message==="Invalid items"?422:error.message==="Duplicate SKU"?422:error.message==="Invalid idempotency key"?400:error.status||500;
  if(status===500)console.error("VIEWS db-server error",error);
  return reply(res,status,{error:status===500?"Internal server error":error.message});
 }
});
if(process.argv[1]&&new URL(import.meta.url).pathname===process.argv[1]){
 const port=Number(process.env.PORT||3200);
 server.listen(port,"127.0.0.1",()=>console.log("VIEWS DB API listening on localhost:"+port));
}
