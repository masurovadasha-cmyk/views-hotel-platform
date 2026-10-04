import { demoRole,json,requestId,requireDatabase,type Env } from "./_shared";

const categoriesByRole:Record<string,string[]>={
  cleaner:["cleaning"],housekeeping_supervisor:["cleaning"],
  concierge:["concierge","laundry","minimart","restaurant","bar","rent_car"],
  technician:["maintenance"],maintenance_manager:["maintenance"],
  front_desk:["reservation_front_desk","concierge"],reservation_manager:["reservation_front_desk"]
};

function management(role:string|null){return role==="general_manager"||role==="super_admin"}

export const onRequestGet=async({request,env}:{request:Request;env:Env})=>{
  const role=demoRole(request);
  if(!role) return json({error:"AUTH_REQUIRED",requestId:requestId(request)},401);
  let db;
  try{db=requireDatabase(env)}catch{return json({error:"DATABASE_NOT_BOUND",requestId:requestId(request)},503)}
  const propertyId=new URL(request.url).searchParams.get("propertyId")||"utower";
  if(management(role)){
    const rows=await db.prepare("SELECT * FROM service_orders WHERE property_id=? ORDER BY created_at DESC LIMIT 100").bind(propertyId).all();
    return json({items:rows.results,requestId:requestId(request)});
  }
  const allowed=categoriesByRole[role]||[];
  if(!allowed.length)return json({items:[],requestId:requestId(request)});
  const marks=allowed.map(()=>"?").join(",");
  const query="SELECT * FROM service_orders WHERE property_id=? AND category IN ("+marks+") ORDER BY created_at DESC LIMIT 100";
  const rows=await db.prepare(query).bind(propertyId,...allowed).all();
  return json({items:rows.results,requestId:requestId(request)});
};

export const onRequestPost=async({request,env}:{request:Request;env:Env})=>{
  const role=demoRole(request);
  if(!role) return json({error:"AUTH_REQUIRED",requestId:requestId(request)},401);
  if(!management(role)&&!["front_desk","housekeeping_supervisor","maintenance_manager"].includes(role))return json({error:"FORBIDDEN",requestId:requestId(request)},403);
  let db;
  try{db=requireDatabase(env)}catch{return json({error:"DATABASE_NOT_BOUND",requestId:requestId(request)},503)}
  const body=await request.json() as Record<string,unknown>;
  const id=crypto.randomUUID();
  const category=String(body.category||"");
  const permitted=management(role)||(role==="front_desk"&&["reservation_front_desk","concierge"].includes(category))||(role==="housekeeping_supervisor"&&category==="cleaning")||(role==="maintenance_manager"&&category==="maintenance");
  if(!permitted)return json({error:"CATEGORY_FORBIDDEN",requestId:requestId(request)},403);
  const propertyId=String(body.propertyId||"utower"), title=String(body.title||"Service order").slice(0,160);
  const idem=request.headers.get("idempotency-key")||crypto.randomUUID();
  try{
    await db.batch([
      db.prepare("INSERT INTO service_orders(id,organization_id,property_id,source,category,title,status,priority,idempotency_key) VALUES(?,?,?,?,?,?,?,?,?)").bind(id,"views",propertyId,"staff",category,title,"new",String(body.priority||"normal"),idem),
      db.prepare("INSERT INTO service_order_events(id,service_order_id,event_type,to_status,payload) VALUES(?,?,?,?,?)").bind(crypto.randomUUID(),id,"service_order.created","new",JSON.stringify({role})),
      db.prepare("INSERT INTO outbox_events(id,organization_id,event_type,aggregate_type,aggregate_id,idempotency_key,payload) VALUES(?,?,?,?,?,?,?)").bind(crypto.randomUUID(),"views","service_order.created","service_order",id,"outbox:"+idem,JSON.stringify({id,propertyId,category}))
    ]);
  }catch(error){return json({error:"WRITE_FAILED",detail:String(error),requestId:requestId(request)},409)}
  return json({id,status:"new",requestId:requestId(request)},201);
};
