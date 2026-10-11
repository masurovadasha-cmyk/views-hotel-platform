import {json,requestId,requireDatabase,type Env} from "./_shared";
import {requireMutationOrigin,resolveSession} from "./_auth";
import {canAccessProperty} from "./_authorization";
import {canOperateFrontDesk,checkInUnitAllowed,nextReservationStatus,type FrontDeskAction} from "./_frontdesk";

export const onRequestPost=async({request,env}:{request:Request;env:Env})=>{
  const originError=requireMutationOrigin(request,env);if(originError)return originError;
  const session=await resolveSession(request,env);
  if(!session||session.mode!=="staff")return json({error:"STAFF_AUTH_REQUIRED",requestId:requestId(request)},401);
  if(!canOperateFrontDesk(session.role))return json({error:"FORBIDDEN",requestId:requestId(request)},403);
  let db;try{db=requireDatabase(env)}catch{return json({error:"DATABASE_NOT_BOUND",requestId:requestId(request)},503)}

  const body=await request.json() as Record<string,unknown>;
  const id=String(body.id||"");
  const action=String(body.action||"") as FrontDeskAction;
  const expectedVersion=Number(body.version);
  if(!id||!["check_in","check_out"].includes(action)||!Number.isInteger(expectedVersion)){
    return json({error:"INVALID_REQUEST",requestId:requestId(request)},400);
  }

  const reservation=await db.prepare([
    "SELECT r.id,r.organization_id,r.property_id,r.unit_id,r.primary_guest_id,r.status,r.version,",
    "u.status AS unit_status,s.status AS stay_status ",
    "FROM reservations r ",
    "LEFT JOIN units u ON u.id=r.unit_id ",
    "LEFT JOIN stays s ON s.reservation_id=r.id ",
    "WHERE r.id=? LIMIT 1"
  ].join("")).bind(id).first<Record<string,unknown>>();
  if(!reservation)return json({error:"NOT_FOUND",requestId:requestId(request)},404);
  if(String(reservation.organization_id)!==session.organizationId)return json({error:"ORGANIZATION_FORBIDDEN",requestId:requestId(request)},403);
  if(!canAccessProperty(session,String(reservation.property_id)))return json({error:"PROPERTY_FORBIDDEN",requestId:requestId(request)},403);
  if(!reservation.unit_id)return json({error:"UNIT_NOT_ASSIGNED",requestId:requestId(request)},409);
  if(Number(reservation.version)!==expectedVersion){
    return json({error:"VERSION_CONFLICT",currentVersion:reservation.version,currentStatus:reservation.status,requestId:requestId(request)},409);
  }

  const to=nextReservationStatus(String(reservation.status),action);
  if(!to)return json({error:"INVALID_TRANSITION",from:reservation.status,action,requestId:requestId(request)},409);
  if(action==="check_in"&&!checkInUnitAllowed(String(reservation.unit_status))){
    return json({error:"UNIT_NOT_READY",unitStatus:reservation.unit_status,requestId:requestId(request)},409);
  }
  if(action==="check_out"&&String(reservation.stay_status)!=="checked_in"){
    return json({error:"STAY_NOT_ACTIVE",stayStatus:reservation.stay_status??null,requestId:requestId(request)},409);
  }

  const nextVersion=expectedVersion+1;
  const stayId="stay:"+id;
  const eventKey="reservation:"+id+":v"+nextVersion+":"+action;
  const payload=JSON.stringify({role:session.role,version:nextVersion,unitId:reservation.unit_id});

  let cleanerId:string|null=null;
  if(action==="check_out"){
    const cleaner=await db.prepare([
      "SELECT sr.user_id FROM staff_roles sr ",
      "JOIN app_users u ON u.id=sr.user_id ",
      "WHERE sr.property_id=? AND sr.role='cleaner' ",
      "AND u.organization_id=? AND u.is_active=1 ",
      "ORDER BY sr.user_id LIMIT 1"
    ].join("")).bind(reservation.property_id,session.organizationId).first<Record<string,unknown>>();
    cleanerId=cleaner?String(cleaner.user_id):null;
  }

  try{
    const statements=[
      db.prepare("UPDATE reservations SET status=?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organization_id=? AND version=?")
        .bind(to,id,session.organizationId,expectedVersion)
    ];

    if(action==="check_in"){
      statements.push(
        db.prepare([
          "INSERT INTO stays(id,organization_id,property_id,reservation_id,unit_id,guest_id,status,checked_in_at,checked_in_by,version) ",
          "SELECT ?,organization_id,property_id,id,unit_id,primary_guest_id,'checked_in',CURRENT_TIMESTAMP,?,1 ",
          "FROM reservations WHERE id=? AND organization_id=? AND version=? AND status='checked_in' ",
          "ON CONFLICT(reservation_id) DO UPDATE SET ",
          "status='checked_in',checked_in_at=CURRENT_TIMESTAMP,checked_in_by=excluded.checked_in_by,",
          "checked_out_at=NULL,checked_out_by=NULL,version=stays.version+1,updated_at=CURRENT_TIMESTAMP"
        ].join("")).bind(stayId,session.userId,id,session.organizationId,nextVersion),
        db.prepare([
          "UPDATE units SET status='occupied' WHERE id=? AND property_id=? ",
          "AND EXISTS(SELECT 1 FROM reservations WHERE id=? AND organization_id=? AND version=? AND status='checked_in')"
        ].join("")).bind(reservation.unit_id,reservation.property_id,id,session.organizationId,nextVersion)
      );
    }else{
      const housekeepingId="hk:checkout:"+id+":v"+nextVersion;
      statements.push(
        db.prepare([
          "UPDATE stays SET status='checked_out',checked_out_at=CURRENT_TIMESTAMP,checked_out_by=?,",
          "version=version+1,updated_at=CURRENT_TIMESTAMP ",
          "WHERE reservation_id=? AND organization_id=? AND status='checked_in' ",
          "AND EXISTS(SELECT 1 FROM reservations WHERE id=? AND organization_id=? AND version=? AND status='completed')"
        ].join("")).bind(session.userId,id,session.organizationId,id,session.organizationId,nextVersion),
        db.prepare([
          "UPDATE units SET status='dirty' WHERE id=? AND property_id=? ",
          "AND EXISTS(SELECT 1 FROM reservations WHERE id=? AND organization_id=? AND version=? AND status='completed')"
        ].join("")).bind(reservation.unit_id,reservation.property_id,id,session.organizationId,nextVersion),
        db.prepare([
          "INSERT OR IGNORE INTO housekeeping_jobs(id,property_id,unit_id,reservation_id,assigned_user_id,status) ",
          "SELECT ?,property_id,unit_id,id,?,'dirty' FROM reservations ",
          "WHERE id=? AND organization_id=? AND version=? AND status='completed'"
        ].join("")).bind(housekeepingId,cleanerId,id,session.organizationId,nextVersion)
      );
    }

    statements.push(
      db.prepare([
        "INSERT INTO reservation_events(id,organization_id,property_id,reservation_id,event_type,from_status,to_status,actor_user_id,payload) ",
        "SELECT ?,organization_id,property_id,id,?,?,?,?,? FROM reservations ",
        "WHERE id=? AND organization_id=? AND version=? AND status=?"
      ].join("")).bind(
        crypto.randomUUID(),"reservation."+action,reservation.status,to,session.userId,payload,
        id,session.organizationId,nextVersion,to
      ),
      db.prepare([
        "INSERT INTO outbox_events(id,organization_id,event_type,aggregate_type,aggregate_id,idempotency_key,payload) ",
        "SELECT ?,organization_id,?,'reservation',id,?,? FROM reservations ",
        "WHERE id=? AND organization_id=? AND version=? AND status=?"
      ].join("")).bind(
        crypto.randomUUID(),"reservation."+action,eventKey,payload,
        id,session.organizationId,nextVersion,to
      )
    );

    const results=await db.batch(statements);
    if(!results[0]?.meta?.changes){
      const current=await db.prepare("SELECT version,status FROM reservations WHERE id=? AND organization_id=? LIMIT 1")
        .bind(id,session.organizationId).first<Record<string,unknown>>();
      return json({
        error:"VERSION_CONFLICT",
        currentVersion:current?.version,
        currentStatus:current?.status,
        requestId:requestId(request)
      },409);
    }
  }catch(error){
    return json({error:"FRONTDESK_WRITE_FAILED",detail:String(error),requestId:requestId(request)},409);
  }

  return json({
    id,
    status:to,
    version:nextVersion,
    unitStatus:action==="check_in"?"occupied":"dirty",
    housekeepingCreated:action==="check_out",
    requestId:requestId(request)
  });
};
