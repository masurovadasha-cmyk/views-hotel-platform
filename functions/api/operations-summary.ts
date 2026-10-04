import {json,requestId,requireDatabase,type Env} from "./_shared";
import {resolveSession} from "./_auth";

export const onRequestGet=async({request,env}:{request:Request;env:Env})=>{
  const session=await resolveSession(request,env);
  if(!session||session.mode!=="staff"||!["general_manager","super_admin"].includes(session.role))return json({error:"FORBIDDEN",requestId:requestId(request)},403);
  let db;try{db=requireDatabase(env)}catch{return json({error:"DATABASE_NOT_BOUND",requestId:requestId(request)},503)}
  const propertyId=new URL(request.url).searchParams.get("propertyId")||session.propertyIds[0];
  const [lost,damage,stock,orders]=await db.batch([
    db.prepare("SELECT COUNT(*) AS count FROM lost_found_items WHERE property_id=? AND status='pending'").bind(propertyId),
    db.prepare("SELECT COUNT(*) AS count FROM damage_reports WHERE property_id=? AND status!='closed'").bind(propertyId),
    db.prepare("SELECT COUNT(*) AS count FROM inventory_items WHERE property_id=? AND quantity<par_level").bind(propertyId),
    db.prepare("SELECT COUNT(*) AS count FROM service_orders WHERE property_id=? AND status NOT IN ('done','closed','cancelled')").bind(propertyId)
  ]);
  const count=(r:{results?:unknown[]})=>Number((r.results?.[0] as Record<string,unknown>|undefined)?.count||0);
  return json({propertyId,lostFoundOpen:count(lost),damageOpen:count(damage),inventoryLow:count(stock),serviceOrdersOpen:count(orders),requestId:requestId(request)});
};
