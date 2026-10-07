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
 async transition(actor:RequestActorContext,token:string,id:string,key:string,action:'check-in'|'check-out'|'guest',input?:unknown){
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
   const type='local_'+action;
   const prior=(await c.query('SELECT request_hash,result_snapshot FROM booking_commands WHERE organization_id=$1 AND command_type=$2 AND idempotency_key=$3',[actor.organizationId,type,key])).rows[0];
   if(prior){if(prior.request_hash!==requestHash)throw new ConflictException('IDEMPOTENCY_CONFLICT');return {...prior.result_snapshot,idempotentReplay:true};}
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
   if(period.length!==1)throw new ConflictException('STAY_INVENTORY_INVALID');
   const clock=(await c.query('SELECT clock_timestamp()::text AS time,clock_timestamp()>=check_in_at AND clock_timestamp()<check_out_at AS arrival,clock_timestamp()>check_in_at AS departure FROM reservations WHERE id=$1',[id])).rows[0];
   const now=clock.time as string;
   if(action==='check-in'){
    if(!clock.arrival)throw new ConflictException('STAY_OUTSIDE_ARRIVAL_WINDOW');
    if((await c.query("SELECT 1 FROM reservations WHERE unit_id=$1 AND status='checked_in' AND id<>$2",[r.unit_id,id])).rowCount)throw new ConflictException('STAY_UNIT_OCCUPIED');
   }else{
    if(!clock.departure)throw new ConflictException('STAY_OUTSIDE_ARRIVAL_WINDOW');
    await c.query("UPDATE inventory_periods SET stay_period=tstzrange(lower(stay_period),LEAST(upper(stay_period),$2::timestamptz),'[)') WHERE id=$1",[period[0].id,now]);
   }
   const result={reservationId:id,status:to,occurredAt:new Date(now).toISOString(),syntheticData:true,idempotentReplay:false};
   await c.query('UPDATE reservations SET status=$2::reservation_status,version=version+1,updated_at=$3 WHERE id=$1',[id,to,now]);
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
