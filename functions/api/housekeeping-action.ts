import { demoRole,json,requestId,requireDatabase,type Env } from "./_shared";
const transitions:Record<string,{from:string[];to:string}>={start:{from:["dirty"],to:"cleaning"},complete:{from:["cleaning"],to:"inspection"},verify:{from:["inspection"],to:"ready"},dnd:{from:["dirty","cleaning"],to:"dnd"},decline:{from:["dirty"],to:"service_declined"}};
export const onRequestPost=async({request,env}:{request:Request;env:Env})=>{
  const role=demoRole(request),userId=request.headers.get("x-views-user-id")||"staff-demo";
  if(!role)return json({error:"AUTH_REQUIRED",requestId:requestId(request)},401);
  if(!["cleaner","housekeeping_supervisor","general_manager","super_admin"].includes(role))return json({error:"FORBIDDEN",requestId:requestId(request)},403);
  let db;try{db=requireDatabase(env)}catch{return json({error:"DATABASE_NOT_BOUND",requestId:requestId(request)},503)}
  const body=await request.json() as Record<string,unknown>,id=String(body.id||""),action=String(body.action||"");
  const job=await db.prepare("SELECT id,status,assigned_user_id FROM housekeeping_jobs WHERE id=? LIMIT 1").bind(id).first<Record<string,unknown>>();
  if(!job)return json({error:"NOT_FOUND",requestId:requestId(request)},404);
  if(role==="cleaner"&&job.assigned_user_id!==userId)return json({error:"NOT_ASSIGNED_TO_USER",requestId:requestId(request)},403);
  const rule=transitions[action];if(!rule||!rule.from.includes(String(job.status)))return json({error:"INVALID_TRANSITION",from:job.status,action,requestId:requestId(request)},409);
  const stamps=rule.to==="cleaning"?",started_at=CURRENT_TIMESTAMP":rule.to==="inspection"?",completed_at=CURRENT_TIMESTAMP":rule.to==="ready"?",verified_at=CURRENT_TIMESTAMP":"";
  await db.prepare("UPDATE housekeeping_jobs SET status=?"+stamps+" WHERE id=?").bind(rule.to,id).run();
  return json({id,status:rule.to,requestId:requestId(request)});
};
