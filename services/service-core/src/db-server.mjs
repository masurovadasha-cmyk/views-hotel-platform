import {readFile} from "node:fs/promises";
import {createServer} from "node:http";
import {Pool} from "pg";
import {verifySignedContext,requireRole} from "./auth.mjs";
import {createOidcVerifier} from "./auth-oidc.mjs";
import {createMarketOrder,inTenantTransaction} from "./postgres.mjs";
import {changeOrderStatus} from "./order-status.mjs";
import {assignMarketTask,updateAssignedTask} from "./dispatch.mjs";
import {initializeCleaningChecklist,completeCleaningItem,finalizeCleaningTask,registerLaundryBag,transitionLaundryBag} from "./cleaning-laundry.mjs";
import {accrueTaskCompensation,approveTaskCompensation} from "./task-compensation.mjs";
import {getGuestOrderTimeline} from "./guest-order-timeline.mjs";
import {listGuestNotifications,markGuestNotificationRead} from "./guest-notifications.mjs";

export const pool=new Pool({connectionString:process.env.DATABASE_URL,max:10,connectionTimeoutMillis:5000});
const oidcMode=process.env.VIEWS_AUTH_MODE==="oidc";
const devMode=process.env.VIEWS_AUTH_MODE===undefined||process.env.VIEWS_AUTH_MODE==="dev";
if(!oidcMode&&!devMode)throw Error("Unsupported authentication mode");
if(devMode&&process.env.VIEWS_ALLOW_DEV_AUTH!=="1")throw Error("Development authentication is disabled; set VIEWS_ALLOW_DEV_AUTH=1 only in isolated test environments");
if(oidcMode&&process.env.VIEWS_ALLOW_DEV_AUTH==="1")throw Error("OIDC mode cannot enable development authentication");
const secret=process.env.VIEWS_AUTH_SECRET;
if(!process.env.DATABASE_URL)throw Error("DATABASE_URL required");
if(devMode&&(!secret||secret.length<32))throw Error("VIEWS_AUTH_SECRET (32+ chars) required for development");
const verifyOidc=oidcMode?createOidcVerifier({
 issuer:process.env.VIEWS_OIDC_ISSUER,
 audience:process.env.VIEWS_OIDC_AUDIENCE,
 jwksUrl:process.env.VIEWS_OIDC_JWKS_URL
}):null;
const reply=(res,status,data)=>{res.writeHead(status,{"content-type":"application/json; charset=utf-8","cache-control":"no-store"});res.end(JSON.stringify(data))};
async function parse(req){let text="";for await(const chunk of req){text+=chunk;if(text.length>32768)throw Object.assign(Error("Payload too large"),{status:413})}try{return JSON.parse(text)}catch{throw Object.assign(Error("Invalid JSON"),{status:400})}}
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const server=createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,"http://localhost");
  const staticFiles={"/staff":{file:"staff.html",type:"text/html; charset=utf-8"},"/staff.js":{file:"staff.js",type:"text/javascript; charset=utf-8"},"/staff.css":{file:"staff.css",type:"text/css; charset=utf-8"},"/finance":{file:"finance.html",type:"text/html; charset=utf-8"},"/finance.js":{file:"finance.js",type:"text/javascript; charset=utf-8"},"/guest":{file:"guest.html",type:"text/html; charset=utf-8"},"/guest.js":{file:"guest.js",type:"text/javascript; charset=utf-8"},"/crm":{file:"crm.html",type:"text/html; charset=utf-8"},"/crm.css":{file:"crm.css",type:"text/css; charset=utf-8"},"/crm.js":{file:"crm.js",type:"text/javascript; charset=utf-8"},"/views-client.js":{file:"views-client.js",type:"text/javascript; charset=utf-8"}};
  if(req.method==="GET"&&staticFiles[url.pathname]&&devMode){
   const entry=staticFiles[url.pathname];
   const data=await readFile(new URL("../public/"+entry.file,import.meta.url));
   res.writeHead(200,{"content-type":entry.type,"cache-control":"no-store","content-security-policy":"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'"});
   return res.end(data);
  }
  if(req.method==="GET"&&url.pathname==="/health"){await pool.query("SELECT 1");return reply(res,200,{status:"ok",mode:"postgres"})}
  const bearer=/^Bearer (.+)$/.exec(req.headers.authorization||"");
  if(!bearer)return reply(res,401,{error:"Unauthorized"});
  let context;try{context=oidcMode?await verifyOidc(bearer[1]):verifySignedContext(bearer[1],secret)}catch{return reply(res,401,{error:"Unauthorized"})}
  if(!uuid.test(context.organizationId))return reply(res,401,{error:"Unauthorized"});
  if(req.method==="GET"&&url.pathname==="/api/v1/me")return reply(res,200,{sub:context.sub,organizationId:context.organizationId,roles:context.roles,authMode:oidcMode?"oidc":"dev"});
  if(req.method==="GET"&&url.pathname==="/api/v1/finance/payments"){
   requireRole(context,["admin","finance"]);
   const rows=await inTenantTransaction(pool,context.organizationId,async db=>(await db.query("SELECT id,order_id,provider,amount_uzs,status,created_at FROM service_payment_intents ORDER BY created_at DESC LIMIT 100")).rows);
   return reply(res,200,rows);
  }
  if(req.method==="GET"&&url.pathname==="/api/v1/finance/refunds"){
   requireRole(context,["admin","finance"]);
   const rows=await inTenantTransaction(pool,context.organizationId,async db=>(await db.query("SELECT id,intent_id,amount_uzs,status,reason,created_at FROM service_refund_requests ORDER BY created_at DESC LIMIT 100")).rows);
   return reply(res,200,rows);
  }
  if(req.method==="POST"&&url.pathname==="/api/v1/compensation/accruals"){
   requireRole(context,["admin","finance"]);
   const body=await parse(req);
   if(!body||!uuid.test(body.taskId)||!Number.isSafeInteger(body.amountUzs))return reply(res,422,{error:"Invalid accrual"});
   return reply(res,201,await accrueTaskCompensation(pool,{organizationId:context.organizationId,taskId:body.taskId,actorId:context.sub,amountUzs:body.amountUzs}));
  }
  const approvalMatch=url.pathname.match(/^\/api\/v1\/compensation\/accruals\/([0-9a-f-]+)\/approve$/i);
  if(req.method==="POST"&&approvalMatch&&uuid.test(approvalMatch[1])){
   requireRole(context,["admin","finance"]);
   return reply(res,200,await approveTaskCompensation(pool,{organizationId:context.organizationId,accrualId:approvalMatch[1],actorId:context.sub}));
  }
  if(req.method==="POST"&&url.pathname==="/api/v1/cleaning/checklists"){
   requireRole(context,["dispatcher","admin"]);
   const body=await parse(req);
   if(!body||!uuid.test(body.taskId))return reply(res,422,{error:"Invalid cleaning task"});
   return reply(res,201,await initializeCleaningChecklist(pool,{organizationId:context.organizationId,taskId:body.taskId,actorId:context.sub,items:body.items}));
  }
  if(req.method==="POST"&&url.pathname==="/api/v1/cleaning/items/complete"){
   requireRole(context,["staff","dispatcher","admin"]);
   const body=await parse(req);
   if(!body||!uuid.test(body.taskId))return reply(res,422,{error:"Invalid cleaning task"});
   return reply(res,200,await completeCleaningItem(pool,{organizationId:context.organizationId,taskId:body.taskId,actorId:context.sub,itemCode:body.itemCode}));
  }
  if(req.method==="POST"&&url.pathname==="/api/v1/cleaning/finalize"){
   requireRole(context,["staff","dispatcher","admin"]);
   const body=await parse(req);
   if(!body||!uuid.test(body.taskId))return reply(res,422,{error:"Invalid cleaning task"});
   return reply(res,200,await finalizeCleaningTask(pool,{organizationId:context.organizationId,taskId:body.taskId,actorId:context.sub}));
  }
  if(req.method==="POST"&&url.pathname==="/api/v1/laundry/bags"){
   requireRole(context,["dispatcher","admin"]);
   const body=await parse(req);
   if(!body||!uuid.test(body.orderId))return reply(res,422,{error:"Invalid laundry order"});
   return reply(res,201,await registerLaundryBag(pool,{organizationId:context.organizationId,orderId:body.orderId,actorId:context.sub,bagCode:body.bagCode,itemCount:body.itemCount,conditionNotes:body.conditionNotes||""}));
  }
  const bagMatch=url.pathname.match(/^\/api\/v1\/laundry\/bags\/([0-9a-f-]+)\/status$/i);
  if(req.method==="PATCH"&&bagMatch&&uuid.test(bagMatch[1])){
   requireRole(context,["staff","dispatcher","admin"]);
   const body=await parse(req);
   if(!body||typeof body.status!=="string")return reply(res,422,{error:"Invalid laundry status"});
   return reply(res,200,await transitionLaundryBag(pool,{organizationId:context.organizationId,bagId:bagMatch[1],actorId:context.sub,nextStatus:body.status}));
  }
  if(req.method==="GET"&&url.pathname==="/api/v1/dispatch/sla"){
   requireRole(context,["dispatcher","admin"]);
   const admin=context.roles.includes("admin");
   const summary=await inTenantTransaction(pool,context.organizationId,async db=>{
    const condition=admin?"":"AND EXISTS (SELECT 1 FROM service_property_access a WHERE a.organization_id=t.organization_id AND a.property_id=t.property_id AND a.principal_id=$1 AND a.permission='order:manage')";
    const query="SELECT count(*)::integer AS total, count(*) FILTER (WHERE t.status IN ('unassigned','assigned','in_progress') AND t.due_at<now())::integer AS overdue, count(*) FILTER (WHERE t.status='completed')::integer AS completed, count(*) FILTER (WHERE t.status IN ('unassigned','assigned','in_progress') AND (t.due_at IS NULL OR t.due_at>=now()))::integer AS open FROM service_dispatch_tasks t WHERE true "+condition;
    return (await db.query(query,admin?[]:[context.sub])).rows[0];
   });
   return reply(res,200,summary);
  }
  const checklistMatch=url.pathname.match(/^\/api\/v1\/staff\/tasks\/([0-9a-f-]+)\/checklist$/i);
  if(req.method==="GET"&&checklistMatch&&uuid.test(checklistMatch[1])){
   requireRole(context,["staff","dispatcher","admin"]);
   const items=await inTenantTransaction(pool,context.organizationId,async db=>{
    const eligible=await db.query("SELECT 1 FROM service_dispatch_tasks WHERE organization_id=$1 AND id=$2 AND task_kind='cleaning' AND assigned_principal_id=$3",[context.organizationId,checklistMatch[1],context.sub]);
    if(!eligible.rowCount)throw Error("Forbidden");
    return (await db.query("SELECT item_code,label,completed_at,completed_by FROM service_cleaning_checklist_items WHERE organization_id=$1 AND task_id=$2 ORDER BY item_code",[context.organizationId,checklistMatch[1]])).rows;
   });
   return reply(res,200,items);
  }
  if(req.method==="GET"&&url.pathname==="/api/v1/staff/tasks"){
   requireRole(context,["staff","dispatcher","admin"]);
   const tasks=await inTenantTransaction(pool,context.organizationId,async db=>(await db.query("SELECT id,order_id,property_id,task_kind,status,due_at FROM service_dispatch_tasks WHERE assigned_principal_id=$1 ORDER BY due_at NULLS LAST,created_at LIMIT 100",[context.sub])).rows);
   return reply(res,200,tasks);
  }
  const taskMatch=url.pathname.match(/^\/api\/v1\/staff\/tasks\/([0-9a-f-]+)$/i);
  if(req.method==="PATCH"&&taskMatch&&uuid.test(taskMatch[1])){
   requireRole(context,["staff","dispatcher","admin"]);
   const body=await parse(req);
   if(!body||typeof body.status!=="string")return reply(res,422,{error:"Invalid task status"});
   const updated=await updateAssignedTask(pool,{organizationId:context.organizationId,taskId:taskMatch[1],actorId:context.sub,nextStatus:body.status});
   return reply(res,200,updated);
  }
  if(req.method==="GET"&&url.pathname==="/api/v1/dispatch/tasks"){
   requireRole(context,["dispatcher","admin"]);
   const admin=context.roles.includes("admin");
   const tasks=await inTenantTransaction(pool,context.organizationId,async db=>(await db.query(admin
    ?"SELECT id,order_id,property_id,task_kind,assigned_principal_id,status,due_at FROM service_dispatch_tasks ORDER BY created_at DESC LIMIT 100"
    :"SELECT t.id,t.order_id,t.property_id,t.task_kind,t.assigned_principal_id,t.status,t.due_at FROM service_dispatch_tasks t WHERE EXISTS (SELECT 1 FROM service_property_access a WHERE a.organization_id=t.organization_id AND a.property_id=t.property_id AND a.principal_id=$1 AND a.permission='order:manage') ORDER BY t.created_at DESC LIMIT 100",admin?[]:[context.sub])).rows);
   return reply(res,200,tasks);
  }
  if(req.method==="POST"&&url.pathname==="/api/v1/dispatch/assign"){
   requireRole(context,["dispatcher","admin"]);
   const body=await parse(req);
   if(!body||!uuid.test(body.orderId)||typeof body.assigneeId!=="string")return reply(res,422,{error:"Invalid task assignment"});
   const assigned=await assignMarketTask(pool,{organizationId:context.organizationId,orderId:body.orderId,actorId:context.sub,assigneeId:body.assigneeId,kind:body.kind||"market_pick",dueAt:body.dueAt||null});
   return reply(res,201,assigned);
  }
  if(req.method==="GET"&&url.pathname==="/api/v1/market/catalog"){
   requireRole(context,["guest","dispatcher","admin"]);
   const products=await inTenantTransaction(pool,context.organizationId,async client=>(await client.query("SELECT sku,name,price_uzs FROM market_catalog WHERE active=true ORDER BY name,sku LIMIT 200")).rows);
   return reply(res,200,products.map(p=>({sku:p.sku,name:p.name,priceUzs:Number(p.price_uzs)})));
  }
  if(req.method==="GET"&&url.pathname==="/api/v1/admin/notifications/health"){
   requireRole(context,["admin"]);
   const metrics=await inTenantTransaction(pool,context.organizationId,async db=>{
    const result=await db.query(
     `SELECT count(*)::integer AS total,
       count(*) FILTER(WHERE status='pending')::integer AS pending,
       count(*) FILTER(WHERE status='dead')::integer AS dead,
       count(*) FILTER(WHERE status='completed')::integer AS completed,
       count(*) FILTER(WHERE status='pending' AND next_attempt_at<=now())::integer AS ready
       FROM service_notification_jobs WHERE organization_id=$1`,
     [context.organizationId]);
    return result.rows[0];
   });
   return reply(res,200,metrics);
  }
  if(req.method==="GET"&&url.pathname==="/api/v1/me/notifications"){
   requireRole(context,["guest"]);
   return reply(res,200,await listGuestNotifications(pool,{organizationId:context.organizationId,principalId:context.sub}));
  }
  const notificationReadMatch=url.pathname.match(/^\/api\/v1\/me\/notifications\/([0-9a-f-]+)\/read$/i);
  if(req.method==="POST"&&notificationReadMatch&&uuid.test(notificationReadMatch[1])){
   requireRole(context,["guest"]);
   return reply(res,200,await markGuestNotificationRead(pool,{organizationId:context.organizationId,principalId:context.sub,notificationId:notificationReadMatch[1]}));
  }
  if(req.method==="GET"&&url.pathname==="/api/v1/me/orders"){
   requireRole(context,["guest"]);
   const orders=await inTenantTransaction(pool,context.organizationId,async db=>(await db.query(
    "SELECT id,property_id,service_type,fulfillment_status,payment_status,total_uzs,created_at FROM service_orders WHERE organization_id=$1 AND created_by=$2 ORDER BY created_at DESC,id DESC LIMIT 20",
    [context.organizationId,context.sub])).rows);
   return reply(res,200,orders);
  }
  if(req.method==="GET"&&url.pathname==="/api/v1/me/bookings"){
   requireRole(context,["guest"]);
   const bookings=await inTenantTransaction(pool,context.organizationId,async client=>(await client.query(
    "SELECT id,property_id,starts_at,ends_at FROM service_guest_bookings WHERE guest_principal_id=$1 AND status='checked_in' AND starts_at<=now() AND ends_at>now() ORDER BY ends_at ASC LIMIT 20",[context.sub])).rows);
   return reply(res,200,bookings);
  }
  if(req.method==="POST"&&url.pathname==="/api/v1/service-orders"){
   requireRole(context,["guest","dispatcher","admin"]);
   const key=req.headers["idempotency-key"];
   const body=await parse(req);
   if(typeof key!=="string"||key.length<8||key.length>128)return reply(res,400,{error:"Valid Idempotency-Key required"});
   if(!body||typeof body!=="object")return reply(res,422,{error:"Invalid request"});
   const guestOnly=context.roles.includes("guest")&&!context.roles.some(role=>["dispatcher","admin"].includes(role));
   if(guestOnly&&!uuid.test(body.bookingId))return reply(res,422,{error:"Valid booking required"});
   if(!guestOnly&&!uuid.test(body.propertyId))return reply(res,422,{error:"Invalid property"});
   const order=await createMarketOrder(pool,{organizationId:context.organizationId,propertyId:guestOnly?null:body.propertyId,bookingId:guestOnly?body.bookingId:null,idempotencyKey:key,items:body.items,principalId:context.sub,isGuest:context.roles.includes('guest')&&!context.roles.some(r=>['dispatcher','admin'].includes(r)),asOf:new Date().toISOString().slice(0,10)});
   return reply(res,order.replayed?200:201,order);
  }
  if(req.method==="GET"&&url.pathname==="/api/v1/service-orders"){
   requireRole(context,["dispatcher","admin"]);
   const admin=context.roles.includes("admin");
   const orders=await inTenantTransaction(pool,context.organizationId,async client=>(await client.query(admin
    ?"SELECT id,property_id,service_type,fulfillment_status,payment_status,total_uzs,delivery_fee_uzs,created_at FROM service_orders ORDER BY created_at DESC LIMIT 100"
    :"SELECT o.id,o.property_id,o.service_type,o.fulfillment_status,o.payment_status,o.total_uzs,o.delivery_fee_uzs,o.created_at FROM service_orders o WHERE EXISTS (SELECT 1 FROM service_property_access a WHERE a.organization_id=o.organization_id AND a.property_id=o.property_id AND a.principal_id=$1 AND a.permission='order:manage') ORDER BY o.created_at DESC LIMIT 100",admin?[]:[context.sub])).rows);
   return reply(res,200,orders);
  }
  const timelineMatch=url.pathname.match(new RegExp("^/api/v1/me/orders/([0-9a-f-]+)/timeline$","i"));
  if(req.method==="GET"&&timelineMatch&&uuid.test(timelineMatch[1])){
   requireRole(context,["guest"]);
   const events=await getGuestOrderTimeline(pool,{organizationId:context.organizationId,orderId:timelineMatch[1],principalId:context.sub});
   return reply(res,200,events);
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
   requireRole(context,["guest","dispatcher","admin"]);
   const isAdmin=context.roles.includes("admin");
   const isDispatcher=context.roles.includes("dispatcher");
   const sql=isAdmin
    ?"SELECT id,property_id,service_type,fulfillment_status,payment_status,total_uzs,delivery_fee_uzs,created_at FROM service_orders WHERE id=$1"
    :isDispatcher
     ?"SELECT o.id,o.property_id,o.service_type,o.fulfillment_status,o.payment_status,o.total_uzs,o.delivery_fee_uzs,o.created_at FROM service_orders o WHERE o.id=$1 AND EXISTS (SELECT 1 FROM service_property_access a WHERE a.organization_id=o.organization_id AND a.property_id=o.property_id AND a.principal_id=$2 AND a.permission='order:manage')"
     :"SELECT id,property_id,service_type,fulfillment_status,payment_status,total_uzs,delivery_fee_uzs,created_at FROM service_orders WHERE id=$1 AND created_by=$2";
   const rows=await inTenantTransaction(pool,context.organizationId,async client=>(await client.query(sql,isAdmin?[match[1]]:[match[1],context.sub])).rows);
   return rows.length?reply(res,200,rows[0]):reply(res,404,{error:"Not found"});
  }
  return reply(res,404,{error:"Not found"});
 }catch(error){
  const status=error.message==="Forbidden"?403:error.message==="Assignee unavailable"?409:error.message==="Order not assignable"?409:error.message==="Task already closed"?409:error.message==="Task already in progress"?409:error.message==="Unsupported task kind"?422:error.message==="Invalid task transition"?409:error.message==="Invalid laundry transition"?409:error.message==="Checklist incomplete"?409:error.message==="Cleaning checklist required"?409:error.message==="Laundry custody required"?409:error.message==="Checklist already initialized"?409:error.message==="Checklist item not available"?409:error.message==="Checklist not editable"?409:error.message==="Order not eligible"?409:error.message==="Invalid laundry bag"?422:error.message==="Invalid accrual amount"?422:error.message==="Accrual conflict"?409:error.message==="Accrual already processed"?409:error.message==="Task not completed"?409:error.message==="Invalid checklist"?422:error.message==="Invalid checklist item"?422:error.message==="Duplicate checklist item"?422:error.message==="Invalid due date"?422:error.message==="Booking access denied"?403:error.message==="Idempotency conflict"?409:error.message==="Insufficient inventory"?409:error.message==="Invalid transition"?409:error.message==="Inventory consistency error"?409:error.message==="Not found"?404:error.message==="Invalid items"?422:error.message==="Duplicate SKU"?422:error.message==="Unavailable SKU"?422:error.message==="Invalid catalog price"?422:error.message==="Price overflow"?422:error.message==="Invalid idempotency key"?400:error.status||500;
  if(status===500)console.error("VIEWS db-server error",error);
  return reply(res,status,{error:status===500?"Internal server error":error.message});
 }
});
if(process.argv[1]&&new URL(import.meta.url).pathname===process.argv[1]){
 const port=Number(process.env.PORT||3200);
 const host=process.env.VIEWS_BIND_HOST||"127.0.0.1";
 server.listen(port,host,()=>console.log("VIEWS DB API listening on "+host+":"+port));
}
