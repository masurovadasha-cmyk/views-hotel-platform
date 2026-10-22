import {openSyntheticDocument,SYNTHETIC_VAULT,issueReviewReceipt,readReviewReceipt} from '../compliance/synthetic-document-vault';
import {createHash} from 'node:crypto';
import {BadRequestException,ConflictException,ForbiddenException,Injectable,NotFoundException,UnauthorizedException} from '@nestjs/common';
import {DatabaseService} from '../database/database.service';
import type {RequestActorContext} from '../identity/actor-context';
export function stayPilotEnabled(org:string){return process.env.NODE_ENV==='test'&&process.env.VIEWS_LOCAL_REHEARSAL==='true'&&process.env.VIEWS_STAFF_AUTH_PILOT_ENABLED==='true'&&process.env.VIEWS_STAFF_STAY_PILOT_ENABLED==='true'&&process.env.VIEWS_STAFF_AUTH_ORGANIZATION_ID===org;}
export type GuestInput={firstName:string;lastName:string;dateOfBirth:string;nationality:string;expectedVersion:number};
export function validateGuest(value:unknown):GuestInput{
 const g=value as GuestInput;
 if(!g||typeof g!=='object'||Array.isArray(g)||Object.keys(g).sort().join(',')!=='dateOfBirth,expectedVersion,firstName,lastName,nationality')throw new BadRequestException('INVALID_GUEST');
 for(const name of [g.firstName,g.lastName])if(typeof name!=='string'||name!==name.trim()||name.length<1||name.length>100||/[\p{Cc}\p{Cf}<>]/u.test(name))throw new BadRequestException('INVALID_GUEST');
 if(typeof g.dateOfBirth!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(g.dateOfBirth)||!Number.isFinite(Date.parse(g.dateOfBirth))||new Date(g.dateOfBirth).toISOString().slice(0,10)!==g.dateOfBirth||g.dateOfBirth<'1900-01-01'||g.dateOfBirth>new Date().toISOString().slice(0,10)||typeof g.nationality!=='string'||! /^[A-Z]{2}$/.test(g.nationality)||!Number.isSafeInteger(g.expectedVersion)||g.expectedVersion<1)throw new BadRequestException('INVALID_GUEST');
 return {firstName:g.firstName,lastName:g.lastName,dateOfBirth:g.dateOfBirth,nationality:g.nationality,expectedVersion:g.expectedVersion};
}
@Injectable()
export class BookingStayService{
 constructor(private readonly db:DatabaseService){}
 async transition(actor:RequestActorContext,token:string,id:string,key:string,action:'check-in'|'check-out'|'guest'|'document-view'|'document-review'|'cleaning-complete',input?:unknown){
  const documentAction=action==='document-view'||action==='document-review';
  const documentId=documentAction?(input as {documentId?:unknown})?.documentId:undefined;
  const decision=(input as {decision?:unknown})?.decision,reviewToken=(input as {reviewToken?:unknown})?.reviewToken;
  if(documentAction&&(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).sort().join(',')!==(action==='document-view'?'documentId':'decision,documentId,reviewToken')||typeof documentId!=='string'||! /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(documentId)))throw new BadRequestException('INVALID_DOCUMENT_REQUEST');
  if(action==='document-review'&&(typeof decision!=='string'||!['verified','rejected'].includes(decision)||typeof reviewToken!=='string'||reviewToken.length>2048))throw new BadRequestException('INVALID_DOCUMENT_REQUEST');
  const guest=action==='guest'?validateGuest(input):undefined;
  const requestHash=guest?createHash('sha256').update(JSON.stringify({id,...guest})).digest('hex'):id;
  if(!stayPilotEnabled(actor.organizationId))throw new NotFoundException('STAY_PILOT_DISABLED');
  if(!/^[a-f0-9]{64}$/.test(token||''))throw new UnauthorizedException('STAFF_SESSION_REQUIRED');
  return this.db.withActor(actor,async c=>{
   await c.query("SET LOCAL statement_timeout='10s'");
   const authorize=async()=>{
    const a=(await c.query('SELECT app.staff_stay_authorize($1,$2) value',[actor.organizationId,createHash('sha256').update(token).digest('hex')])).rows[0]?.value;
    if(!a||a.userId!==actor.userId||a.membershipId!==actor.membershipId)throw new UnauthorizedException('STAFF_SESSION_REQUIRED');
   };
   await authorize();
   await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[actor.organizationId+':'+action+':'+key]);
   const r=(await c.query(`SELECT r.*,app.can_access_property(r.property_id) allowed FROM reservations r
    WHERE r.id=$1 AND r.organization_id=$2 FOR UPDATE OF r`,[id,actor.organizationId])).rows[0];
   if(!r||!r.allowed)throw new ForbiddenException('PROPERTY_FORBIDDEN');
   if(!(await c.query('SELECT app.staff_stay_scope($1,$2,$3) allowed',[actor.organizationId,createHash('sha256').update(token).digest('hex'),r.property_id])).rows[0]?.allowed)throw new ForbiddenException('PROPERTY_FORBIDDEN');
   if(r.quote_snapshot?.localStayPilot!==true||r.total_minor!=='0'||!r.unit_id)throw new ConflictException('STAY_FIXTURE_REQUIRED');
   const unit=(await c.query('SELECT status FROM units WHERE id=$1 AND property_id=$2 FOR UPDATE',[r.unit_id,r.property_id])).rows[0];
   await authorize(); // wall-clock expiry after reservation/unit lock waits
   if(documentAction){
    if(process.env.VIEWS_LOCAL_DOCUMENT_PILOT_ENABLED!=='true')throw new NotFoundException('DOCUMENT_PREVIEW_DISABLED');
    if(!['confirmed','checked_in'].includes(r.status))throw new ConflictException('STAY_STATE_CHANGED');
    const doc=(await c.query(`SELECT d.id,d.reservation_guest_id,d.encrypted_fields,d.object_checksum_sha256,d.verification_status,d.updated_at::text stamp
      FROM guest_document_records d JOIN reservation_guests g ON g.id=d.reservation_guest_id AND g.organization_id=d.organization_id
      WHERE d.id=$1 AND g.reservation_id=$2 AND g.organization_id=$3 AND g.is_primary AND d.vault_id=$4
      FOR UPDATE OF d`,[documentId,id,actor.organizationId,SYNTHETIC_VAULT])).rows[0];
    await authorize();
    if(!doc)throw new NotFoundException('SYNTHETIC_DOCUMENT_UNAVAILABLE');
    let text:string;
    try{text=openSyntheticDocument({organizationId:actor.organizationId,reservationId:id,guestId:doc.reservation_guest_id,documentId:doc.id},process.env.VIEWS_LOCAL_DOCUMENT_KEY||'',doc.encrypted_fields,doc.object_checksum_sha256);}
    catch{throw new ConflictException('SYNTHETIC_DOCUMENT_UNAVAILABLE');}
    const secret=process.env.VIEWS_LOCAL_DOCUMENT_KEY||'',sessionHash=createHash('sha256').update(token).digest('hex');
    if(action==='document-review'){
     const type='local_document-review',hash=createHash('sha256').update(JSON.stringify({id,documentId,decision,reviewToken})).digest('hex');
     let receipt;
     try{receipt=readReviewReceipt(reviewToken as string,secret);}catch{throw new ConflictException('DOCUMENT_REVIEW_RECEIPT_INVALID');}
     if(receipt.organizationId!==actor.organizationId||receipt.reservationId!==id||receipt.documentId!==doc.id||receipt.membershipId!==actor.membershipId||receipt.sessionHash!==sessionHash)throw new ConflictException('DOCUMENT_REVIEW_RECEIPT_INVALID');
     const prior=(await c.query('SELECT request_hash,result_snapshot FROM booking_commands WHERE organization_id=$1 AND command_type=$2 AND idempotency_key=$3',[actor.organizationId,type,key])).rows[0];
     if(prior){if(prior.request_hash!==hash)throw new ConflictException('IDEMPOTENCY_CONFLICT');return {...prior.result_snapshot,idempotentReplay:true};}
     if(decision==='verified'&&(await c.query("SELECT d.expires_on<(clock_timestamp() AT TIME ZONE p.timezone)::date expired FROM guest_document_records d JOIN properties p ON p.id=$2 WHERE d.id=$1",[doc.id,r.property_id])).rows[0]?.expired)throw new ConflictException('DOCUMENT_EXPIRED');
     if(!Number.isSafeInteger(receipt.expiresAt)||receipt.expiresAt<=Date.now()||receipt.checksum!==doc.object_checksum_sha256||receipt.stamp!==doc.stamp||doc.verification_status!=='pending')throw new ConflictException('DOCUMENT_REVIEW_STALE');
     await c.query("UPDATE guest_document_records SET verification_status=$2::document_verification_status,verified_at=CASE WHEN $2='verified' THEN clock_timestamp() ELSE NULL END,verified_by=CASE WHEN $2='verified' THEN $3::uuid ELSE NULL END,updated_at=clock_timestamp() WHERE id=$1",[doc.id,decision,actor.userId]);
     await c.query('UPDATE reservations SET version=version+1,updated_at=clock_timestamp() WHERE id=$1',[id]);
     const result={reservationId:id,documentId:doc.id,status:decision,syntheticData:true,idempotentReplay:false};
     await c.query('INSERT INTO booking_commands(organization_id,idempotency_key,command_type,reservation_id,request_hash,result_snapshot,completed_at) VALUES($1,$2,$3,$4,$5,$6,clock_timestamp())',[actor.organizationId,key,type,id,hash,result]);
     await c.query("INSERT INTO outbox_events(organization_id,aggregate_type,aggregate_id,event_type,idempotency_key,payload) VALUES($1,'guest_document',$2,'staff.synthetic_document_reviewed',$3,$4)",[actor.organizationId,doc.id,'synthetic-review:'+actor.organizationId+':'+key,result]);
     await c.query("INSERT INTO audit_log(organization_id,actor_user_id,actor_membership_id,action,entity_type,entity_id,after_state) VALUES($1,$2,$3,'staff.synthetic_document_reviewed','guest_document',$4,$5)",[actor.organizationId,actor.userId,actor.membershipId,doc.id,result]);
     return result;
    }
    await c.query("INSERT INTO audit_log(organization_id,actor_user_id,actor_membership_id,action,entity_type,entity_id,after_state) VALUES($1,$2,$3,'staff.synthetic_document_viewed','guest_document',$4,$5)",[actor.organizationId,actor.userId,actor.membershipId,doc.id,{reservationId:id,syntheticData:true}]);
    return {documentId:doc.id,text,status:doc.verification_status,syntheticData:true,reviewToken:doc.verification_status==='pending'?issueReviewReceipt({organizationId:actor.organizationId,reservationId:id,documentId:doc.id,membershipId:actor.membershipId,sessionHash,checksum:doc.object_checksum_sha256,stamp:doc.stamp,expiresAt:Date.now()+60000},secret):null};
   }
   const type='local_'+action;
   const prior=(await c.query('SELECT request_hash,result_snapshot FROM booking_commands WHERE organization_id=$1 AND command_type=$2 AND idempotency_key=$3',[actor.organizationId,type,key])).rows[0];
   if(prior){if(prior.request_hash!==requestHash)throw new ConflictException('IDEMPOTENCY_CONFLICT');return {...prior.result_snapshot,idempotentReplay:true};}
   if(action==='cleaning-complete'){
    if(r.status!=='checked_out')throw new ConflictException('STAY_STATE_CHANGED');
    if((await c.query("SELECT 1 FROM reservations WHERE unit_id=$1 AND status='checked_in'",[r.unit_id])).rowCount)throw new ConflictException('STAY_UNIT_OCCUPIED');
    const task=(await c.query("UPDATE local_stay_turnovers SET status='completed',completed_at=clock_timestamp(),completed_by=$2 WHERE reservation_id=$1 AND status='pending' RETURNING reservation_id",[id,actor.userId])).rows[0];
    await authorize();
    if(!task)throw new ConflictException('TURNOVER_STATE_CHANGED');
    const result={reservationId:id,status:'completed',syntheticData:true,idempotentReplay:false};
    await c.query('INSERT INTO booking_commands(organization_id,idempotency_key,command_type,reservation_id,request_hash,result_snapshot,completed_at) VALUES($1,$2,$3,$4,$5,$6,clock_timestamp())',[actor.organizationId,key,type,id,requestHash,result]);
    await c.query("INSERT INTO outbox_events(organization_id,aggregate_type,aggregate_id,event_type,idempotency_key,payload) VALUES($1,'reservation',$2,'staff.synthetic_turnover_completed',$3,$4)",[actor.organizationId,id,'turnover:'+actor.organizationId+':'+key,result]);
    await c.query("INSERT INTO audit_log(organization_id,actor_user_id,actor_membership_id,action,entity_type,entity_id,after_state) VALUES($1,$2,$3,'staff.synthetic_turnover_completed','reservation',$4,$5)",[actor.organizationId,actor.userId,actor.membershipId,id,result]);
    return result;
   }
   if(guest){
    if(r.status!=='confirmed')throw new ConflictException('STAY_STATE_CHANGED');
    if(r.version!==guest.expectedVersion)throw new ConflictException('GUEST_VERSION_CHANGED');
    const current=(await c.query('SELECT id,guest_profile_id FROM reservation_guests WHERE reservation_id=$1 AND is_primary FOR UPDATE',[id])).rows[0];
    if(current&&(current.guest_profile_id||(await c.query('SELECT 1 FROM guest_document_records WHERE reservation_guest_id=$1 UNION ALL SELECT 1 FROM guest_registration_cases WHERE reservation_guest_id=$1 LIMIT 1',[current.id])).rowCount))throw new ConflictException('GUEST_DOCUMENT_REVIEW_REQUIRED');
    if(current)await c.query('UPDATE reservation_guests SET first_name=$2,last_name=$3,date_of_birth=$4,nationality_country_code=$5,updated_at=clock_timestamp() WHERE id=$1',[current.id,guest.firstName,guest.lastName,guest.dateOfBirth,guest.nationality]);
    else await c.query('INSERT INTO reservation_guests(organization_id,reservation_id,is_primary,first_name,last_name,date_of_birth,nationality_country_code) VALUES($1,$2,true,$3,$4,$5,$6)',[actor.organizationId,id,guest.firstName,guest.lastName,guest.dateOfBirth,guest.nationality]);
    await c.query('UPDATE reservations SET version=version+1,updated_at=clock_timestamp() WHERE id=$1',[id]);
    const result={reservationId:id,version:r.version+1,syntheticData:true,idempotentReplay:false};
    await c.query("INSERT INTO booking_commands(organization_id,idempotency_key,command_type,reservation_id,request_hash,result_snapshot,completed_at) VALUES($1,$2,$3,$4,$5,$6,clock_timestamp())",[actor.organizationId,key,type,id,requestHash,result]);
    await c.query("INSERT INTO outbox_events(organization_id,aggregate_type,aggregate_id,event_type,idempotency_key,payload) VALUES($1,'reservation',$2,'booking.local_guest_updated',$3,$4)",[actor.organizationId,id,'stay:'+actor.organizationId+':'+type+':'+key,result]);
    await c.query("INSERT INTO audit_log(organization_id,actor_user_id,actor_membership_id,action,entity_type,entity_id,after_state) VALUES($1,$2,$3,'staff.local_guest_updated','reservation',$4,$5)",[actor.organizationId,actor.userId,actor.membershipId,id,result]);
    return result;
   }
   const from=action==='check-in'?'confirmed':'checked_in',to=action==='check-in'?'checked_in':'checked_out';
   if(r.status!==from)throw new ConflictException('STAY_STATE_CHANGED');
   if(unit?.status!=='active')throw new ConflictException('STAY_UNIT_UNAVAILABLE');
   if((await c.query('SELECT 1 FROM payment_intents WHERE reservation_id=$1 LIMIT 1',[id])).rowCount)throw new ConflictException('STAY_FINANCIAL_REVIEW_REQUIRED');
   if(!(await c.query('SELECT 1 FROM reservation_guests WHERE reservation_id=$1 AND organization_id=$2 AND is_primary FOR SHARE',[id,actor.organizationId])).rowCount)throw new ConflictException('STAY_GUEST_REQUIRED');
   const period=(await c.query(`SELECT p.id FROM inventory_periods p JOIN reservations r ON r.id=p.reservation_id WHERE p.reservation_id=$1 AND p.unit_id=$2 AND p.property_id=r.property_id AND p.organization_id=r.organization_id AND p.kind='reservation'
    AND p.stay_period=tstzrange(r.check_in_at,r.check_out_at,'[)') FOR UPDATE OF p`,[id,r.unit_id])).rows;
   await authorize();
   if(period.length!==1)throw new ConflictException('STAY_INVENTORY_INVALID');
   const clock=(await c.query('SELECT clock_timestamp()::text AS time,clock_timestamp()>=check_in_at AND clock_timestamp()<check_out_at AS arrival,clock_timestamp()>check_in_at AS departure FROM reservations WHERE id=$1',[id])).rows[0];
   const now=clock.time as string;
   if(action==='check-in'){
    if((await c.query("SELECT 1 FROM local_stay_turnovers WHERE unit_id=$1 AND status='pending'",[r.unit_id])).rowCount)throw new ConflictException('STAY_CLEANING_REQUIRED');
    if(!clock.arrival)throw new ConflictException('STAY_OUTSIDE_ARRIVAL_WINDOW');
    if((await c.query("SELECT 1 FROM reservations WHERE unit_id=$1 AND status='checked_in' AND id<>$2",[r.unit_id,id])).rowCount)throw new ConflictException('STAY_UNIT_OCCUPIED');
   }else{
    if(!clock.departure)throw new ConflictException('STAY_OUTSIDE_ARRIVAL_WINDOW');
    await c.query("UPDATE inventory_periods SET stay_period=tstzrange(lower(stay_period),LEAST(upper(stay_period),$2::timestamptz),'[)') WHERE id=$1",[period[0].id,now]);
   }
   const result={reservationId:id,status:to,occurredAt:new Date(now).toISOString(),syntheticData:true,idempotentReplay:false};
   await c.query('UPDATE reservations SET status=$2::reservation_status,version=version+1,updated_at=$3 WHERE id=$1',[id,to,now]);
   if(action==='check-out')await c.query('INSERT INTO local_stay_turnovers(reservation_id,organization_id,property_id,unit_id) VALUES($1,$2,$3,$4)',[id,actor.organizationId,r.property_id,r.unit_id]);
   await c.query(`INSERT INTO booking_commands(organization_id,idempotency_key,command_type,reservation_id,request_hash,result_snapshot,completed_at)
    VALUES($1,$2,$3,$4::uuid,$4::uuid::text,$5,clock_timestamp())`,[actor.organizationId,key,type,id,result]);
   await c.query(`INSERT INTO booking_state_events(organization_id,reservation_id,event_type,from_status,to_status,actor_user_id,idempotency_key,payload)
    VALUES($1,$2,$3,$4::reservation_status,$5::reservation_status,$6,$7,$8)`,[actor.organizationId,id,'booking.'+to,from,to,actor.userId,key,{syntheticData:true,occurredAt:result.occurredAt}]);
   await c.query(`INSERT INTO outbox_events(organization_id,aggregate_type,aggregate_id,event_type,idempotency_key,payload)
    VALUES($1,'reservation',$2,$3,$4,$5)`,[actor.organizationId,id,'booking.'+to,'stay:'+actor.organizationId+':'+type+':'+key,result]);
   await c.query(`INSERT INTO audit_log(organization_id,actor_user_id,actor_membership_id,action,entity_type,entity_id,after_state)
    VALUES($1,$2,$3,$4,'reservation',$5,$6)`,[actor.organizationId,actor.userId,actor.membershipId,'staff.local_'+to,id,result]);
   return result;
  });
 }
}
