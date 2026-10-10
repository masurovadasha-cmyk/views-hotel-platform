import {json,requestId,requireDatabase,type Env} from "./_shared";
import {resolveSession} from "./_auth";
import {canAccessProperty} from "./_authorization";

const allowedRoles=["housekeeping_supervisor","maintenance_manager","general_manager","super_admin"];

export const onRequestGet=async({request,env}:{request:Request;env:Env})=>{
  const session=await resolveSession(request,env);
  if(!session||session.mode!=="staff")return json({error:"STAFF_AUTH_REQUIRED",requestId:requestId(request)},401);
  if(!allowedRoles.includes(session.role))return json({error:"FORBIDDEN",requestId:requestId(request)},403);
  let db;try{db=requireDatabase(env)}catch{return json({error:"DATABASE_NOT_BOUND",requestId:requestId(request)},503)}

  const propertyId=new URL(request.url).searchParams.get("propertyId")||session.propertyIds[0]||"";
  if(!canAccessProperty(session,propertyId))return json({error:"PROPERTY_FORBIDDEN",requestId:requestId(request)},403);

  const property=await db.prepare("SELECT id FROM properties WHERE id=? AND organization_id=? AND is_active=1 LIMIT 1")
    .bind(propertyId,session.organizationId).first<Record<string,unknown>>();
  if(!property)return json({error:"PROPERTY_NOT_FOUND",requestId:requestId(request)},404);

  const roleFilter=session.role==="housekeeping_supervisor"
    ?["cleaner","housekeeping_supervisor"]
    :session.role==="maintenance_manager"
      ?["technician","maintenance_manager"]
      :null;
  const roleClause=roleFilter?"AND s.role IN (?,?) ":"";

  const staffSql=[
    "SELECT u.id AS user_id,u.display_name,s.role,",
    "(SELECT COUNT(*) FROM service_orders o WHERE o.organization_id=u.organization_id AND o.property_id=s.property_id AND o.assigned_user_id=u.id AND o.status NOT IN ('done','closed','cancelled')) AS open_service_orders,",
    "(SELECT COUNT(*) FROM housekeeping_jobs h WHERE h.property_id=s.property_id AND h.assigned_user_id=u.id AND h.status NOT IN ('ready','service_declined')) AS open_housekeeping,",
    "(SELECT COUNT(*) FROM maintenance_tickets m WHERE m.property_id=s.property_id AND m.assigned_user_id=u.id AND m.status!='closed') AS open_maintenance,",
    "(SELECT COUNT(*) FROM service_orders o WHERE o.organization_id=u.organization_id AND o.property_id=s.property_id AND o.assigned_user_id=u.id AND o.status IN ('done','closed') AND date(o.updated_at)=date('now')) AS service_done_today ",
    "FROM app_users u JOIN staff_roles s ON s.user_id=u.id ",
    "WHERE u.organization_id=? AND s.property_id=? AND u.is_active=1 ",
    roleClause,
    "ORDER BY s.role,u.display_name,u.id"
  ].join("");
  const staff=roleFilter
    ?await db.prepare(staffSql).bind(session.organizationId,propertyId,...roleFilter).all()
    :await db.prepare(staffSql).bind(session.organizationId,propertyId).all();

  const summary=await db.prepare([
    "SELECT ",
    "(SELECT COUNT(*) FROM service_orders WHERE organization_id=? AND property_id=? AND status NOT IN ('done','closed','cancelled')) AS active_service_orders,",
    "(SELECT COUNT(*) FROM service_orders WHERE organization_id=? AND property_id=? AND assigned_user_id IS NULL AND status NOT IN ('done','closed','cancelled')) AS unassigned_service_orders,",
    "(SELECT COUNT(*) FROM housekeeping_jobs WHERE property_id=? AND status NOT IN ('ready','service_declined')) AS active_housekeeping,",
    "(SELECT COUNT(*) FROM maintenance_tickets WHERE property_id=? AND status!='closed') AS active_maintenance"
  ].join("")).bind(
    session.organizationId,propertyId,
    session.organizationId,propertyId,
    propertyId,
    propertyId
  ).first<Record<string,unknown>>();

  return json({
    propertyId,
    staff:(staff.results||[]).map(raw=>{
      const row=raw as Record<string,unknown>;
      const openServiceOrders=Number(row.open_service_orders||0);
      const openHousekeeping=Number(row.open_housekeeping||0);
      const openMaintenance=Number(row.open_maintenance||0);
      return {
        userId:String(row.user_id),
        displayName:String(row.display_name),
        role:String(row.role),
        openServiceOrders,
        openHousekeeping,
        openMaintenance,
        activeTasks:openServiceOrders+openHousekeeping+openMaintenance,
        serviceDoneToday:Number(row.service_done_today||0)
      };
    }),
    summary:{
      activeServiceOrders:Number(summary?.active_service_orders||0),
      unassignedServiceOrders:Number(summary?.unassigned_service_orders||0),
      activeHousekeeping:Number(summary?.active_housekeeping||0),
      activeMaintenance:Number(summary?.active_maintenance||0)
    },
    requestId:requestId(request)
  });
};
