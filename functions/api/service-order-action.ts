import { demoRole,json,requestId,requireDatabase,type Env } from "./_shared";

const categoriesByRole:Record<string,string[]>={
  cleaner:["cleaning"],housekeeping_supervisor:["cleaning"],
  concierge:["concierge","laundry","minimart","restaurant","bar","rent_car"],
  technician:["maintenance"],maintenance_manager:["maintenance"],
  front_desk:["reservation_front_desk","concierge"],reservation_manager:["reservation_front_desk"]
};
const management=(r:string|null)=>r==="general_manager"||r==="super_admin";

function nextStatus(status:string,action:string){
  const map:Record<string,{from:string[];to:string}>={
    accept:{from:["new","assigned"],to:"accepted"},
    start:{from:["new","assigned","accepted","waiting"],to:"in_progress"},
    complete:{from:["accepted","in_progress","waiting"],to:"done"},
    cancel:{from:["new","assigned","accepted"],to:"cancelled"}
  };
  const rule=map[action];
  return rule&&rule.from.includes(status)?rule.to:null;
}

export const onRequestPost=async({request,env}:{request:Request;env:Env})=>{
  const role=demoRole(request),userId=request.headers.get("x-views-user-id")||"staff-demo";
  if(!role)return json({error:"AUTH_REQUIRED",requestId:requestId(request)},401);
  let db;try{db=requireDatabase(env)}catch{return json({error:"DATABASE_NOT_BOUND",requestId:requestId(request)},503)}
  const body=await request.json() as Record<string,unknown>;
  const id=String(body.id||""),action=String(body.action||""),expectedVersion=Number(body.version);
  if(!id||!Number.isInteger(expectedVersion))return json({error:"INVALID_REQUEST",requestId:requestId(request)},400);
  const order=await db.prepare("SELECT id,category,status,assigned_user_id,version FROM service_orders WHERE id=? LIMIT 1").bind(id).first<Record<string,unknown>>();
  if(!order)return json({error:"NOT_FOUND",requestId:requestId(request)},404);
  const allowed=management(role)||(categoriesByRole[role]||[]).includes(String(order.category));
  if(!allowed)return json({error:"FORBIDDEN",requestId:requestId(request)},403);
  if((role==="cleaner"||role==="technician")&&order.assigned_user_id&&order.assigned_user_id!==userId)return json({error:"NOT_ASSIGNED_TO_USER",requestId:requestId(request)},403);
  if(Number(order.version)!==expectedVersion)return json({error:"VERSION_CONFLICT",currentVersion:order.version,requestId:requestId(request)},409);
  const to=nextStatus(String(order.status),action);
  if(!to)return json({error:"INVALID_TRANSITION",from:order.status,action,requestId:requestId(request)},409);
  const assignee=order.assigned_user_id||(["accept","start"].includes(action)?userId:null);
  const result=await db.prepare("UPDATE service_orders SET status=?,assigned_user_id=?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND version=?").bind(to,assignee,id,expectedVersion).run();
  if(!result.meta?.changes)return json({error:"VERSION_CONFLICT",requestId:requestId(request)},409);
  const eventId=crypto.randomUUID(),outboxId=crypto.randomUUID(),eventKey="order:"+id+":v"+(expectedVersion+1)+":"+action;
  await db.batch([
    db.prepare("INSERT INTO service_order_events(id,service_order_id,event_type,from_status,to_status,actor_user_id,payload) VALUES(?,?,?,?,?,?,?)").bind(eventId,id,"service_order."+action,order.status,to,userId,JSON.stringify({role,version:expectedVersion+1})),
    db.prepare("INSERT INTO outbox_events(id,organization_id,event_type,aggregate_type,aggregate_id,idempotency_key,payload) VALUES(?,?,?,?,?,?,?)").bind(outboxId,"views","service_order."+action,"service_order",id,eventKey,JSON.stringify({id,from:order.status,to,version:expectedVersion+1}))
  ]);
  return json({id,status:to,version:expectedVersion+1,assignedUserId:assignee,requestId:requestId(request)});
};
