import { demoRole,json,requestId,requireDatabase,type Env } from "./_shared";
const transitions:Record<string,{from:string[];to:string}>={start:{from:["open","assigned"],to:"in_progress"},wait:{from:["in_progress"],to:"waiting"},block:{from:["open","assigned","in_progress","waiting"],to:"blocked"},resolve:{from:["open","assigned","in_progress","waiting","blocked"],to:"inspection"},verify:{from:["inspection"],to:"closed"}};
export const onRequestPost=async({request,env}:{request:Request;env:Env})=>{
  const role=demoRole(request),userId=request.headers.get("x-views-user-id")||"staff-demo";
  if(!role)return json({error:"AUTH_REQUIRED",requestId:requestId(request)},401);
  if(!["technician","maintenance_manager","general_manager","super_admin"].includes(role))return json({error:"FORBIDDEN",requestId:requestId(request)},403);
  let db;try{db=requireDatabase(env)}catch{return json({error:"DATABASE_NOT_BOUND",requestId:requestId(request)},503)}
  const body=await request.json() as Record<string,unknown>,id=String(body.id||""),action=String(body.action||"");
  const ticket=await db.prepare("SELECT id,status,assigned_user_id FROM maintenance_tickets WHERE id=? LIMIT 1").bind(id).first<Record<string,unknown>>();
  if(!ticket)return json({error:"NOT_FOUND",requestId:requestId(request)},404);
  if(role==="technician"&&ticket.assigned_user_id!==userId)return json({error:"NOT_ASSIGNED_TO_USER",requestId:requestId(request)},403);
  const rule=transitions[action];if(!rule||!rule.from.includes(String(ticket.status)))return json({error:"INVALID_TRANSITION",from:ticket.status,action,requestId:requestId(request)},409);
  const resolved=rule.to==="inspection"?",resolved_at=CURRENT_TIMESTAMP":"";
  await db.prepare("UPDATE maintenance_tickets SET status=?"+resolved+" WHERE id=?").bind(rule.to,id).run();
  return json({id,status:rule.to,requestId:requestId(request)});
};
