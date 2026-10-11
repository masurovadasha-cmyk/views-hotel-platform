import {json,requestId,requireDatabase,type Env} from "./_shared";
import {resolveSession} from "./_auth";

export const onRequestGet=async({request,env}:{request:Request;env:Env})=>{
  const session=await resolveSession(request,env);
  if(!session||session.mode!=="guest"){
    return json({error:"GUEST_AUTH_REQUIRED",requestId:requestId(request)},401);
  }
  let db;
  try{db=requireDatabase(env)}catch{
    return json({error:"DATABASE_NOT_BOUND",requestId:requestId(request)},503);
  }

  const sql=[
    "SELECT r.id,r.confirmation_code,r.status,r.check_in_date,r.check_out_date,",
    "r.total_amount,r.currency,p.name AS property_name,p.city,u.code AS unit_code ",
    "FROM reservations r ",
    "JOIN properties p ON p.id=r.property_id ",
    "LEFT JOIN units u ON u.id=r.unit_id ",
    "WHERE r.primary_guest_id=? ",
    "ORDER BY r.check_in_date DESC LIMIT 50"
  ].join("");

  const rows=await db.prepare(sql).bind(session.guestId).all();
  return json({items:rows.results,requestId:requestId(request)});
};
