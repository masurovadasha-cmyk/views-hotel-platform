import {json,requestId,requireDatabase,type Env} from "./_shared";
import {resolveSession,requireMutationOrigin} from "./_auth";

const allowedRoles=["housekeeping_supervisor","maintenance_manager","general_manager","super_admin"];

export const onRequestPost=async({request,env}:{request:Request;env:Env})=>{
  const originError=requireMutationOrigin(request,env);if(originError)return originError;
  const session=await resolveSession(request,env);
  if(!session||session.mode!=="staff")return json({error:"STAFF_AUTH_REQUIRED",requestId:requestId(request)},401);
  if(!allowedRoles.includes(session.role))return json({error:"FORBIDDEN",requestId:requestId(request)},403);
  let db;try{db=requireDatabase(env)}catch{return json({error:"DATABASE_NOT_BOUND",requestId:requestId(request)},503)}
  const body=await request.json() as Record<string,unknown>;
  const id=String(body.id||""),delta=Number(body.delta),note=String(body.note||"").slice(0,500);
  if(!id||!Number.isFinite(delta)||delta===0)return json({error:"INVALID_REQUEST",requestId:requestId(request)},400);
  const item=await db.prepare("SELECT id,property_id,quantity FROM inventory_items WHERE id=? LIMIT 1").bind(id).first<Record<string,unknown>>();
  if(!item)return json({error:"NOT_FOUND",requestId:requestId(request)},404);
  if(!session.propertyIds.includes(String(item.property_id))&&!["general_manager","super_admin"].includes(session.role))return json({error:"PROPERTY_FORBIDDEN",requestId:requestId(request)},403);
  const next=Number(item.quantity)+delta;if(next<0)return json({error:"NEGATIVE_STOCK",requestId:requestId(request)},409);
  await db.batch([
    db.prepare("UPDATE inventory_items SET quantity=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(next,id),
    db.prepare("INSERT INTO inventory_movements(id,inventory_item_id,movement_type,quantity,actor_user_id,note) VALUES(?,?,?,?,?,?)")
      .bind(crypto.randomUUID(),id,delta>0?"restock":"consume",delta,session.userId,note),
    db.prepare("INSERT INTO operations_events(id,organization_id,property_id,aggregate_type,aggregate_id,event_type,actor_user_id,payload) VALUES(?,?,?,?,?,?,?,?)")
      .bind(crypto.randomUUID(),session.organizationId,item.property_id,"inventory",id,"inventory.adjusted",session.userId,JSON.stringify({delta,next}))
  ]);
  return json({id,quantity:next,requestId:requestId(request)});
};
