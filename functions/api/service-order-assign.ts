import {json,requestId,requireDatabase,type Env} from "./_shared";
import {requireMutationOrigin,resolveSession} from "./_auth";
import {canAccessProperty,canWorkServiceCategory,isManagement,serviceCategoriesByRole} from "./_authorization";

const supervisorRoles=["housekeeping_supervisor","maintenance_manager"];

export const onRequestPost=async({request,env}:{request:Request;env:Env})=>{
  const originError=requireMutationOrigin(request,env);if(originError)return originError;
  const session=await resolveSession(request,env);
  if(!session||session.mode!=="staff")return json({error:"STAFF_AUTH_REQUIRED",requestId:requestId(request)},401);
  if(!isManagement(session.role)&&!supervisorRoles.includes(session.role)){
    return json({error:"FORBIDDEN",requestId:requestId(request)},403);
  }
  let db;try{db=requireDatabase(env)}catch{return json({error:"DATABASE_NOT_BOUND",requestId:requestId(request)},503)}

  const body=await request.json() as Record<string,unknown>;
  const id=String(body.id||"");
  const assignedUserId=String(body.assignedUserId||"");
  const expectedVersion=Number(body.version);
  if(!id||!assignedUserId||!Number.isInteger(expectedVersion)){
    return json({error:"INVALID_REQUEST",requestId:requestId(request)},400);
  }

  const order=await db.prepare([
    "SELECT id,organization_id,property_id,category,status,assigned_user_id,version ",
    "FROM service_orders WHERE id=? LIMIT 1"
  ].join("")).bind(id).first<Record<string,unknown>>();
  if(!order)return json({error:"NOT_FOUND",requestId:requestId(request)},404);
  if(String(order.organization_id)!==session.organizationId)return json({error:"ORGANIZATION_FORBIDDEN",requestId:requestId(request)},403);
  if(!canAccessProperty(session,String(order.property_id)))return json({error:"PROPERTY_FORBIDDEN",requestId:requestId(request)},403);
  if(!isManagement(session.role)&&!canWorkServiceCategory(session.role,String(order.category))){
    return json({error:"CATEGORY_FORBIDDEN",requestId:requestId(request)},403);
  }
  if(Number(order.version)!==expectedVersion){
    return json({error:"VERSION_CONFLICT",currentVersion:order.version,currentStatus:order.status,requestId:requestId(request)},409);
  }
  if(["done","closed","cancelled"].includes(String(order.status))){
    return json({error:"ORDER_NOT_ASSIGNABLE",status:order.status,requestId:requestId(request)},409);
  }

  const roles=await db.prepare([
    "SELECT sr.role FROM staff_roles sr JOIN app_users u ON u.id=sr.user_id ",
    "WHERE sr.user_id=? AND sr.property_id=? AND u.organization_id=? AND u.is_active=1"
  ].join("")).bind(assignedUserId,order.property_id,session.organizationId).all();

  const targetRoles=(roles.results||[]).map(raw=>String((raw as Record<string,unknown>).role));
  const category=String(order.category);
  const targetRole=targetRoles.find(role=>(serviceCategoriesByRole[role]||[]).includes(category));
  if(!targetRole)return json({error:"ASSIGNEE_ROLE_MISMATCH",category,targetRoles,requestId:requestId(request)},409);

  const toStatus=String(order.status)==="new"?"assigned":String(order.status);
  const nextVersion=expectedVersion+1;
  const eventKey="order:"+id+":v"+nextVersion+":assigned";
  const payload=JSON.stringify({
    role:session.role,
    assignedUserId,
    assigneeRole:targetRole,
    previousAssignee:order.assigned_user_id??null,
    version:nextVersion
  });

  try{
    const results=await db.batch([
      db.prepare([
        "UPDATE service_orders SET assigned_user_id=?,status=?,version=version+1,updated_at=CURRENT_TIMESTAMP ",
        "WHERE id=? AND organization_id=? AND version=?"
      ].join("")).bind(assignedUserId,toStatus,id,session.organizationId,expectedVersion),
      db.prepare([
        "INSERT INTO service_order_events(id,service_order_id,event_type,from_status,to_status,actor_user_id,payload) ",
        "SELECT ?,id,'service_order.assigned',?,?,?,? FROM service_orders ",
        "WHERE id=? AND organization_id=? AND version=? AND assigned_user_id=?"
      ].join("")).bind(
        crypto.randomUUID(),order.status,toStatus,session.userId,payload,
        id,session.organizationId,nextVersion,assignedUserId
      ),
      db.prepare([
        "INSERT INTO outbox_events(id,organization_id,event_type,aggregate_type,aggregate_id,idempotency_key,payload) ",
        "SELECT ?,organization_id,'service_order.assigned','service_order',id,?,? FROM service_orders ",
        "WHERE id=? AND organization_id=? AND version=? AND assigned_user_id=?"
      ].join("")).bind(
        crypto.randomUUID(),eventKey,payload,
        id,session.organizationId,nextVersion,assignedUserId
      )
    ]);
    if(!results[0]?.meta?.changes){
      const current=await db.prepare("SELECT version,status,assigned_user_id FROM service_orders WHERE id=? AND organization_id=? LIMIT 1")
        .bind(id,session.organizationId).first<Record<string,unknown>>();
      return json({
        error:"VERSION_CONFLICT",
        currentVersion:current?.version,
        currentStatus:current?.status,
        currentAssignee:current?.assigned_user_id,
        requestId:requestId(request)
      },409);
    }
  }catch(error){
    return json({error:"ASSIGNMENT_WRITE_FAILED",detail:String(error),requestId:requestId(request)},409);
  }

  return json({
    id,
    status:toStatus,
    version:nextVersion,
    assignedUserId,
    assigneeRole:targetRole,
    requestId:requestId(request)
  });
};
