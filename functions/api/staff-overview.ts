import {json,requestId,requireDatabase,type Env} from "./_shared";
import {resolveSession} from "./_auth";
import {canAccessProperty,isManagement,serviceCategoriesByRole} from "./_authorization";
import {canOperateFrontDesk} from "./_frontdesk";

function canSeeHousekeeping(role:string){
  return ["cleaner","housekeeping_supervisor","general_manager","super_admin"].includes(role);
}

function canSeeMaintenance(role:string){
  return ["technician","maintenance_manager","general_manager","super_admin"].includes(role);
}

export const onRequestGet=async({request,env}:{request:Request;env:Env})=>{
  const session=await resolveSession(request,env);
  if(!session||session.mode!=="staff")return json({error:"STAFF_AUTH_REQUIRED",requestId:requestId(request)},401);
  let db;try{db=requireDatabase(env)}catch{return json({error:"DATABASE_NOT_BOUND",requestId:requestId(request)},503)}

  const propertyId=new URL(request.url).searchParams.get("propertyId")||session.propertyIds[0]||"";
  if(!canAccessProperty(session,propertyId))return json({error:"PROPERTY_FORBIDDEN",requestId:requestId(request)},403);

  const property=await db.prepare("SELECT id,name,city FROM properties WHERE id=? AND organization_id=? AND is_active=1 LIMIT 1")
    .bind(propertyId,session.organizationId).first<Record<string,unknown>>();
  if(!property)return json({error:"PROPERTY_NOT_FOUND",requestId:requestId(request)},404);

  const management=isManagement(session.role);
  const allowedCategories=serviceCategoriesByRole[session.role]||[];
  let serviceSql="";
  let serviceCountSql="";
  let serviceValues:unknown[]=[];

  if(management){
    serviceSql=[
      "SELECT id,title,category,status,priority,assigned_user_id,unit_id,version,created_at ",
      "FROM service_orders WHERE organization_id=? AND property_id=? ",
      "AND status NOT IN ('done','closed','cancelled') ",
      "ORDER BY CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,created_at ASC LIMIT 8"
    ].join("");
    serviceCountSql="SELECT COUNT(*) AS count FROM service_orders WHERE organization_id=? AND property_id=? AND status NOT IN ('done','closed','cancelled')";
    serviceValues=[session.organizationId,propertyId];
  }else if(allowedCategories.length){
    const marks=allowedCategories.map(()=>"?").join(",");
    const ownOnly=session.role==="cleaner"||session.role==="technician";
    serviceSql=[
      "SELECT id,title,category,status,priority,assigned_user_id,unit_id,version,created_at ",
      "FROM service_orders WHERE organization_id=? AND property_id=? ",
      "AND category IN ("+marks+") ",
      ownOnly?"AND assigned_user_id=? ":"",
      "AND status NOT IN ('done','closed','cancelled') ",
      "ORDER BY CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,created_at ASC LIMIT 8"
    ].join("");
    serviceCountSql=[
      "SELECT COUNT(*) AS count FROM service_orders WHERE organization_id=? AND property_id=? ",
      "AND category IN ("+marks+") ",
      ownOnly?"AND assigned_user_id=? ":"",
      "AND status NOT IN ('done','closed','cancelled')"
    ].join("");
    serviceValues=[
      session.organizationId,
      propertyId,
      ...allowedCategories,
      ...(ownOnly?[session.userId]:[])
    ];
  }

  const serviceRows=serviceSql
    ?await db.prepare(serviceSql).bind(...serviceValues).all()
    :{results:[]};
  const serviceCount=serviceCountSql
    ?await db.prepare(serviceCountSql).bind(...serviceValues).first<{count:number}>()
    :null;

  const serviceOrdersOpen=Number(serviceCount?.count||0);

  let housekeepingOpen:number|null=null;
  if(canSeeHousekeeping(session.role)){
    const own=session.role==="cleaner";
    const row=own
      ?await db.prepare("SELECT COUNT(*) AS count FROM housekeeping_jobs WHERE property_id=? AND assigned_user_id=? AND status NOT IN ('ready','service_declined')")
        .bind(propertyId,session.userId).first<{count:number}>()
      :await db.prepare("SELECT COUNT(*) AS count FROM housekeeping_jobs WHERE property_id=? AND status NOT IN ('ready','service_declined')")
        .bind(propertyId).first<{count:number}>();
    housekeepingOpen=Number(row?.count||0);
  }

  let maintenanceOpen:number|null=null;
  if(canSeeMaintenance(session.role)){
    const own=session.role==="technician";
    const row=own
      ?await db.prepare("SELECT COUNT(*) AS count FROM maintenance_tickets WHERE property_id=? AND assigned_user_id=? AND status!='closed'")
        .bind(propertyId,session.userId).first<{count:number}>()
      :await db.prepare("SELECT COUNT(*) AS count FROM maintenance_tickets WHERE property_id=? AND status!='closed'")
        .bind(propertyId).first<{count:number}>();
    maintenanceOpen=Number(row?.count||0);
  }

  let arrivals:number|null=null,inHouse:number|null=null,readyUnits:number|null=null;
  let arrivalItems:unknown[]=[];
  if(canOperateFrontDesk(session.role)){
    const [arrivalCount,inHouseCount,readyCount,queue]=await db.batch([
      db.prepare("SELECT COUNT(*) AS count FROM reservations WHERE organization_id=? AND property_id=? AND status IN ('confirmed','assigned')")
        .bind(session.organizationId,propertyId),
      db.prepare("SELECT COUNT(*) AS count FROM reservations WHERE organization_id=? AND property_id=? AND status='checked_in'")
        .bind(session.organizationId,propertyId),
      db.prepare("SELECT COUNT(*) AS count FROM units WHERE property_id=? AND status IN ('available','ready')")
        .bind(propertyId),
      db.prepare([
        "SELECT r.id,r.confirmation_code,r.status,r.check_in_date,r.check_out_date,u.code AS unit_code,",
        "g.first_name,g.last_name,g.vip ",
        "FROM reservations r JOIN guests g ON g.id=r.primary_guest_id LEFT JOIN units u ON u.id=r.unit_id ",
        "WHERE r.organization_id=? AND r.property_id=? AND r.status IN ('confirmed','assigned','checked_in') ",
        "ORDER BY CASE r.status WHEN 'checked_in' THEN 0 ELSE 1 END,r.check_in_date ASC LIMIT 6"
      ].join("")).bind(session.organizationId,propertyId)
    ]);
    const count=(result:{results?:unknown[]})=>Number((result.results?.[0] as Record<string,unknown>|undefined)?.count||0);
    arrivals=count(arrivalCount);
    inHouse=count(inHouseCount);
    readyUnits=count(readyCount);
    arrivalItems=queue.results||[];
  }

  return json({
    property:{
      id:propertyId,
      name:String(property.name),
      city:String(property.city)
    },
    role:session.role,
    counts:{
      serviceOrdersOpen,
      housekeepingOpen,
      maintenanceOpen,
      arrivals,
      inHouse,
      readyUnits
    },
    recentServiceOrders:serviceRows.results||[],
    arrivalItems,
    requestId:requestId(request)
  });
};
