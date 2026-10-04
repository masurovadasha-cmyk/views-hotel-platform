import {json,requestId,requireDatabase,type Env} from "./_shared";
import {requireMutationOrigin,resolveSession} from "./_auth";

const allowed=["concierge","cleaning","laundry","minimart","restaurant","bar","rent_car"];

export const onRequestPost=async({request,env}:{request:Request;env:Env})=>{
  const originError=requireMutationOrigin(request,env);if(originError)return originError;
  const session=await resolveSession(request,env);
  if(!session||session.mode!=="guest")return json({error:"GUEST_AUTH_REQUIRED",requestId:requestId(request)},401);
  let db;
  try{db=requireDatabase(env)}catch{return json({error:"DATABASE_NOT_BOUND",requestId:requestId(request)},503)}
  const body=await request.json() as Record<string,unknown>;
  const reservationId=String(body.reservationId||""),category=String(body.category||""),title=String(body.title||"").trim(),description=String(body.details||"").trim();
  if(!reservationId||!allowed.includes(category)||title.length<2||title.length>160||description.length<2||description.length>2000)return json({error:"INVALID_REQUEST",requestId:requestId(request)},400);

  const reservation=await db.prepare("SELECT id,property_id,unit_id,primary_guest_id,status FROM reservations WHERE id=? AND primary_guest_id=? AND organization_id=? LIMIT 1")
    .bind(reservationId,session.guestId,session.organizationId).first<Record<string,unknown>>();
  if(!reservation)return json({error:"RESERVATION_NOT_FOUND",requestId:requestId(request)},404);
  if(["cancelled","completed","no_show"].includes(String(reservation.status)))return json({error:"RESERVATION_NOT_ACTIVE",requestId:requestId(request)},409);

  const idem=request.headers.get("idempotency-key")||crypto.randomUUID();
  const existing=await db.prepare("SELECT id,status FROM service_orders WHERE idempotency_key=? AND organization_id=? LIMIT 1")
    .bind(idem,session.organizationId).first<Record<string,unknown>>();
  if(existing)return json({id:existing.id,status:existing.status,idempotentReplay:true,requestId:requestId(request)});

  const id=crypto.randomUUID(),eventId=crypto.randomUUID(),outboxId=crypto.randomUUID();
  await db.batch([
    db.prepare("INSERT INTO service_orders(id,organization_id,property_id,unit_id,guest_id,reservation_id,source,category,title,description,status,priority,idempotency_key) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)")
      .bind(id,session.organizationId,reservation.property_id,reservation.unit_id,session.guestId,reservationId,"guest",category,title,description,"new","normal",idem),
    db.prepare("INSERT INTO service_order_events(id,service_order_id,event_type,to_status,actor_guest_id,payload) VALUES(?,?,?,?,?,?)")
      .bind(eventId,id,"service_order.created","new",session.guestId,JSON.stringify({source:"guest"})),
    db.prepare("INSERT INTO outbox_events(id,organization_id,event_type,aggregate_type,aggregate_id,idempotency_key,payload) VALUES(?,?,?,?,?,?,?)")
      .bind(outboxId,session.organizationId,"service_order.created","service_order",id,"outbox:"+idem,JSON.stringify({id,reservationId,category}))
  ]);
  return json({id,status:"new",idempotentReplay:false,requestId:requestId(request)},201);
};
