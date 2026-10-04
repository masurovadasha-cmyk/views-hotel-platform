import {json,requestId,requireDatabase,type Env} from "./_shared";
import {resolveSession} from "./_auth";

export const onRequestGet=async({request,env}:{request:Request;env:Env})=>{
 const session=await resolveSession(request,env);
 if(!session||session.mode!=="staff")return json({error:"STAFF_AUTH_REQUIRED",requestId:requestId(request)},401);
 let db;try{db=requireDatabase(env)}catch{return json({error:"DATABASE_NOT_BOUND",requestId:requestId(request)},503)}
 const unitId=new URL(request.url).searchParams.get("unitId");
 if(!unitId)return json({error:"UNIT_REQUIRED",requestId:requestId(request)},400);
 const rows=await db.prepare("SELECT event_type,from_status,to_status,payload,created_at FROM service_order_events WHERE service_order_id IN (SELECT id FROM service_orders WHERE unit_id=?) ORDER BY created_at DESC LIMIT 100").bind(unitId).all();
 return json({unitId,items:rows.results,requestId:requestId(request)});
};
