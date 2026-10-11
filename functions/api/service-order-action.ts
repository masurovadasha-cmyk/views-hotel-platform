import {json,requestId,requireDatabase,type Env} from "./_shared";
import {requireMutationOrigin,resolveSession} from "./_auth";
import {canAccessProperty,canWorkServiceCategory} from "./_authorization";

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
  const originError=requireMutationOrigin(request,env);if(originError)return originError;
  const session=await resolveSession(request,env);
  if(!session||session.mode!=="staff")return json({error:"STAFF_AUTH_REQUIRED",requestId:requestId(request)},401);
  let db;try{db=requireDatabase(env)}catch{return json({error:"DATABASE_NOT_BOUND",requestId:requestId(request)},503)}

  const body=await request.json() as Record<string,unknown>;
  const id=String(body.id||""),action=String(body.action||""),expectedVersion=Number(body.version);
  if(!id||!Number.isInteger(expectedVersion))return json({error:"INVALID_REQUEST",requestId:requestId(request)},400);

  const order=await db.prepare("SELECT id,organization_id,property_id,category,status,assigned_user_id,version FROM service_orders WHERE id=? LIMIT 1")
    .bind(id).first<Record<string,unknown>>();
  if(!order)return json({error:"NOT_FOUND",requestId:requestId(request)},404);
  if(String(order.organization_id)!==session.organizationId)return json({error:"ORGANIZATION_FORBIDDEN",requestId:requestId(request)},403);
  if(!canAccessProperty(session,String(order.property_id)))return json({error:"PROPERTY_FORBIDDEN",requestId:requestId(request)},403);
  if(!canWorkServiceCategory(session.role,String(order.category)))return json({error:"FORBIDDEN",requestId:requestId(request)},403);
  if((session.role==="cleaner"||session.role==="technician")&&order.assigned_user_id&&order.assigned_user_id!==session.userId){
    return json({error:"NOT_ASSIGNED_TO_USER",requestId:requestId(request)},403);
  }
  if(Number(order.version)!==expectedVersion)return json({error:"VERSION_CONFLICT",currentVersion:order.version,requestId:requestId(request)},409);

  const to=nextStatus(String(order.status),action);
  if(!to)return json({error:"INVALID_TRANSITION",from:order.status,action,requestId:requestId(request)},409);

  const assignee=order.assigned_user_id||(["accept","start"].includes(action)?session.userId:null);
  const nextVersion=expectedVersion+1;
  const eventKey="order:"+id+":v"+nextVersion+":"+action;
  const payload=JSON.stringify({role:session.role,version:nextVersion});
  const outboxPayload=JSON.stringify({id,from:order.status,to,version:nextVersion});

  try{
    const results=await db.batch([
      db.prepare("UPDATE service_orders SET status=?,assigned_user_id=?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organization_id=? AND version=?")
        .bind(to,assignee,id,session.organizationId,expectedVersion),
      db.prepare([
        "INSERT INTO service_order_events(id,service_order_id,event_type,from_status,to_status,actor_user_id,payload) ",
        "SELECT ?,id,?,?,?,?,? FROM service_orders ",
        "WHERE id=? AND organization_id=? AND version=? AND status=?"
      ].join(""))
        .bind(crypto.randomUUID(),"service_order."+action,order.status,to,session.userId,payload,id,session.organizationId,nextVersion,to),
      db.prepare([
        "INSERT INTO outbox_events(id,organization_id,event_type,aggregate_type,aggregate_id,idempotency_key,payload) ",
        "SELECT ?,organization_id,?,'service_order',id,?,? FROM service_orders ",
        "WHERE id=? AND organization_id=? AND version=? AND status=?"
      ].join(""))
        .bind(crypto.randomUUID(),"service_order."+action,eventKey,outboxPayload,id,session.organizationId,nextVersion,to)
    ]);

    if(!results[0]?.meta?.changes){
      const current=await db.prepare("SELECT version,status FROM service_orders WHERE id=? AND organization_id=? LIMIT 1")
        .bind(id,session.organizationId).first<Record<string,unknown>>();
      return json({error:"VERSION_CONFLICT",currentVersion:current?.version,currentStatus:current?.status,requestId:requestId(request)},409);
    }
  }catch(error){
    const current=await db.prepare("SELECT version,status FROM service_orders WHERE id=? AND organization_id=? LIMIT 1")
      .bind(id,session.organizationId).first<Record<string,unknown>>();
    if(current&&Number(current.version)!==expectedVersion){
      return json({error:"VERSION_CONFLICT",currentVersion:current.version,currentStatus:current.status,requestId:requestId(request)},409);
    }
    return json({error:"TRANSITION_WRITE_FAILED",detail:String(error),requestId:requestId(request)},409);
  }

  return json({id,status:to,version:nextVersion,assignedUserId:assignee,requestId:requestId(request)});
};
