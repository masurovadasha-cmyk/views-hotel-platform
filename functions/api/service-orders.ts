import {json,requestId,requireDatabase,type Env} from "./_shared";
import {requireMutationOrigin,resolveSession} from "./_auth";
import {canAccessProperty,isManagement,serviceCategoriesByRole} from "./_authorization";
import {scopedIdempotencyKey} from "./_idempotency";

const safeColumns=[
  "id","organization_id","property_id","unit_id","guest_id","reservation_id","stay_id",
  "assigned_user_id","source","category","title","description","status","priority","sla_due_at",
  "currency","proof_metadata","version","created_at","updated_at"
].join(",");

export const onRequestGet=async({request,env}:{request:Request;env:Env})=>{
  const session=await resolveSession(request,env);
  if(!session||session.mode!=="staff")return json({error:"STAFF_AUTH_REQUIRED",requestId:requestId(request)},401);
  let db;try{db=requireDatabase(env)}catch{return json({error:"DATABASE_NOT_BOUND",requestId:requestId(request)},503)}

  const propertyId=new URL(request.url).searchParams.get("propertyId")||session.propertyIds[0]||"";
  if(!canAccessProperty(session,propertyId))return json({error:"PROPERTY_FORBIDDEN",requestId:requestId(request)},403);
  const property=await db.prepare("SELECT id FROM properties WHERE id=? AND organization_id=? AND is_active=1 LIMIT 1")
    .bind(propertyId,session.organizationId).first<Record<string,unknown>>();
  if(!property)return json({error:"PROPERTY_NOT_FOUND",requestId:requestId(request)},404);

  if(isManagement(session.role)){
    const rows=await db.prepare("SELECT * FROM service_orders WHERE organization_id=? AND property_id=? ORDER BY created_at DESC LIMIT 100")
      .bind(session.organizationId,propertyId).all();
    return json({items:rows.results,requestId:requestId(request)});
  }

  const allowed=serviceCategoriesByRole[session.role]||[];
  if(!allowed.length)return json({items:[],requestId:requestId(request)});
  const marks=allowed.map(()=>"?").join(",");
  const query=`SELECT ${safeColumns} FROM service_orders WHERE organization_id=? AND property_id=? AND category IN (${marks}) ORDER BY created_at DESC LIMIT 100`;
  const rows=await db.prepare(query).bind(session.organizationId,propertyId,...allowed).all();
  return json({items:rows.results,requestId:requestId(request)});
};

export const onRequestPost=async({request,env}:{request:Request;env:Env})=>{
  const originError=requireMutationOrigin(request,env);if(originError)return originError;
  const session=await resolveSession(request,env);
  if(!session||session.mode!=="staff")return json({error:"STAFF_AUTH_REQUIRED",requestId:requestId(request)},401);
  if(!isManagement(session.role)&&!["front_desk","housekeeping_supervisor","maintenance_manager"].includes(session.role)){
    return json({error:"FORBIDDEN",requestId:requestId(request)},403);
  }
  let db;try{db=requireDatabase(env)}catch{return json({error:"DATABASE_NOT_BOUND",requestId:requestId(request)},503)}

  const body=await request.json() as Record<string,unknown>;
  const category=String(body.category||"");
  const permitted=isManagement(session.role)
    ||(session.role==="front_desk"&&["reservation_front_desk","concierge"].includes(category))
    ||(session.role==="housekeeping_supervisor"&&category==="cleaning")
    ||(session.role==="maintenance_manager"&&category==="maintenance");
  if(!permitted)return json({error:"CATEGORY_FORBIDDEN",requestId:requestId(request)},403);

  const propertyId=String(body.propertyId||session.propertyIds[0]||"");
  if(!canAccessProperty(session,propertyId))return json({error:"PROPERTY_FORBIDDEN",requestId:requestId(request)},403);
  const property=await db.prepare("SELECT id FROM properties WHERE id=? AND organization_id=? AND is_active=1 LIMIT 1")
    .bind(propertyId,session.organizationId).first<Record<string,unknown>>();
  if(!property)return json({error:"PROPERTY_NOT_FOUND",requestId:requestId(request)},404);

  const title=String(body.title||"").trim();
  const priority=String(body.priority||"normal");
  if(title.length<2||title.length>160||!["low","normal","high","urgent"].includes(priority)){
    return json({error:"INVALID_REQUEST",requestId:requestId(request)},400);
  }

  const idem=scopedIdempotencyKey(session.organizationId,request.headers.get("idempotency-key"));
  if(!idem)return json({error:"IDEMPOTENCY_KEY_REQUIRED",requestId:requestId(request)},400);
  const existing=await db.prepare("SELECT id,status FROM service_orders WHERE idempotency_key=? LIMIT 1")
    .bind(idem).first<Record<string,unknown>>();
  if(existing)return json({id:existing.id,status:existing.status,idempotentReplay:true,requestId:requestId(request)});

  const id=crypto.randomUUID();
  try{
    await db.batch([
      db.prepare("INSERT INTO service_orders(id,organization_id,property_id,source,category,title,status,priority,idempotency_key) VALUES(?,?,?,?,?,?,?,?,?)")
        .bind(id,session.organizationId,propertyId,"staff",category,title,"new",priority,idem),
      db.prepare("INSERT INTO service_order_events(id,service_order_id,event_type,to_status,actor_user_id,payload) VALUES(?,?,?,?,?,?)")
        .bind(crypto.randomUUID(),id,"service_order.created","new",session.userId,JSON.stringify({role:session.role})),
      db.prepare("INSERT INTO outbox_events(id,organization_id,event_type,aggregate_type,aggregate_id,idempotency_key,payload) VALUES(?,?,?,?,?,?,?)")
        .bind(crypto.randomUUID(),session.organizationId,"service_order.created","service_order",id,"outbox:"+idem,JSON.stringify({id,propertyId,category}))
    ]);
  }catch(error){
    const replay=await db.prepare("SELECT id,status FROM service_orders WHERE idempotency_key=? LIMIT 1").bind(idem).first<Record<string,unknown>>();
    if(replay)return json({id:replay.id,status:replay.status,idempotentReplay:true,requestId:requestId(request)});
    return json({error:"WRITE_FAILED",detail:String(error),requestId:requestId(request)},409);
  }
  return json({id,status:"new",idempotentReplay:false,requestId:requestId(request)},201);
};
