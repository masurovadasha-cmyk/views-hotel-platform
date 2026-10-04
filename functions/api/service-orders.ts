import {json,requestId,requireDatabase,type Env} from "./_shared";
import {requireMutationOrigin,resolveSession} from "./_auth";

const categoriesByRole:Record<string,string[]>={
  cleaner:["cleaning"],housekeeping_supervisor:["cleaning"],
  concierge:["concierge","laundry","minimart","restaurant","bar","rent_car"],
  technician:["maintenance"],maintenance_manager:["maintenance"],
  front_desk:["reservation_front_desk","concierge"],reservation_manager:["reservation_front_desk"]
};

function management(role:string){return role==="general_manager"||role==="super_admin"}

export const onRequestGet=async({request,env}:{request:Request;env:Env})=>{
  const session=await resolveSession(request,env);
  if(!session||session.mode!=="staff")return json({error:"STAFF_AUTH_REQUIRED",requestId:requestId(request)},401);
  let db;
  try{db=requireDatabase(env)}catch{return json({error:"DATABASE_NOT_BOUND",requestId:requestId(request)},503)}
  const propertyId=new URL(request.url).searchParams.get("propertyId")||session.propertyIds[0]||"";
  if(!propertyId)return json({error:"PROPERTY_REQUIRED",requestId:requestId(request)},400);
  if(!management(session.role)&&!session.propertyIds.includes(propertyId))return json({error:"PROPERTY_FORBIDDEN",requestId:requestId(request)},403);

  if(management(session.role)){
    const rows=await db.prepare("SELECT * FROM service_orders WHERE organization_id=? AND property_id=? ORDER BY created_at DESC LIMIT 100")
      .bind(session.organizationId,propertyId).all();
    return json({items:rows.results,requestId:requestId(request)});
  }
  const allowed=categoriesByRole[session.role]||[];
  if(!allowed.length)return json({items:[],requestId:requestId(request)});
  const marks=allowed.map(()=>"?").join(",");
  const query="SELECT * FROM service_orders WHERE organization_id=? AND property_id=? AND category IN ("+marks+") ORDER BY created_at DESC LIMIT 100";
  const rows=await db.prepare(query).bind(session.organizationId,propertyId,...allowed).all();
  return json({items:rows.results,requestId:requestId(request)});
};

export const onRequestPost=async({request,env}:{request:Request;env:Env})=>{
  const originError=requireMutationOrigin(request,env);if(originError)return originError;
  const session=await resolveSession(request,env);
  if(!session||session.mode!=="staff")return json({error:"STAFF_AUTH_REQUIRED",requestId:requestId(request)},401);
  const role=session.role;
  if(!management(role)&&!["front_desk","housekeeping_supervisor","maintenance_manager"].includes(role))return json({error:"FORBIDDEN",requestId:requestId(request)},403);
  let db;
  try{db=requireDatabase(env)}catch{return json({error:"DATABASE_NOT_BOUND",requestId:requestId(request)},503)}
  const body=await request.json() as Record<string,unknown>;
  const id=crypto.randomUUID();
  const category=String(body.category||"");
  const permitted=management(role)||(role==="front_desk"&&["reservation_front_desk","concierge"].includes(category))||(role==="housekeeping_supervisor"&&category==="cleaning")||(role==="maintenance_manager"&&category==="maintenance");
  if(!permitted)return json({error:"CATEGORY_FORBIDDEN",requestId:requestId(request)},403);
  const propertyId=String(body.propertyId||session.propertyIds[0]||"");
  if(!propertyId)return json({error:"PROPERTY_REQUIRED",requestId:requestId(request)},400);
  if(!management(role)&&!session.propertyIds.includes(propertyId))return json({error:"PROPERTY_FORBIDDEN",requestId:requestId(request)},403);
  const property=await db.prepare("SELECT id FROM properties WHERE id=? AND organization_id=? AND is_active=1 LIMIT 1")
    .bind(propertyId,session.organizationId).first<Record<string,unknown>>();
  if(!property)return json({error:"PROPERTY_NOT_FOUND",requestId:requestId(request)},404);
  const title=String(body.title||"Service order").slice(0,160);
  const idem=request.headers.get("idempotency-key")||crypto.randomUUID();
  const existing=await db.prepare("SELECT id,status FROM service_orders WHERE idempotency_key=? AND organization_id=? LIMIT 1")
    .bind(idem,session.organizationId).first<Record<string,unknown>>();
  if(existing)return json({id:existing.id,status:existing.status,idempotentReplay:true,requestId:requestId(request)});
  try{
    await db.batch([
      db.prepare("INSERT INTO service_orders(id,organization_id,property_id,source,category,title,status,priority,idempotency_key) VALUES(?,?,?,?,?,?,?,?,?)")
        .bind(id,session.organizationId,propertyId,"staff",category,title,"new",String(body.priority||"normal"),idem),
      db.prepare("INSERT INTO service_order_events(id,service_order_id,event_type,to_status,actor_user_id,payload) VALUES(?,?,?,?,?,?)")
        .bind(crypto.randomUUID(),id,"service_order.created","new",session.userId,JSON.stringify({role})),
      db.prepare("INSERT INTO outbox_events(id,organization_id,event_type,aggregate_type,aggregate_id,idempotency_key,payload) VALUES(?,?,?,?,?,?,?)")
        .bind(crypto.randomUUID(),session.organizationId,"service_order.created","service_order",id,"outbox:"+idem,JSON.stringify({id,propertyId,category}))
    ]);
  }catch(error){return json({error:"WRITE_FAILED",detail:String(error),requestId:requestId(request)},409)}
  return json({id,status:"new",idempotentReplay:false,requestId:requestId(request)},201);
};
