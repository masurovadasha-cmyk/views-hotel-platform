import {BadRequestException,ConflictException,Injectable,NotFoundException,UnauthorizedException} from '@nestjs/common';
import {createHash,randomUUID} from 'node:crypto';
import {ownerOperatingProperty} from './owner-operating-property';
import type {PoolClient} from 'pg';
import {DatabaseService} from '../database/database.service';
import type {RequestActorContext} from '../identity/actor-context';
import {calendarRequest,calendarId,calendarWindow} from './owner-calendar.input';
import {inventoryHash} from './owner-inventory.store';
const source=(id:string)=>'owner-calendar:'+id;
@Injectable()
export class OwnerCalendarService{
 constructor(private readonly db:DatabaseService){}
 private enabled(){if(process.env.NODE_ENV!=='test'||process.env.VIEWS_LOCAL_REHEARSAL!=='true'||process.env.VIEWS_OWNER_CALENDAR_ENABLED!=='true')throw new NotFoundException('OWNER_CALENDAR_DISABLED');}
 private async authorize(c:PoolClient,actor:RequestActorContext,id:string,session?:string){
  if(session===undefined)return ownerOperatingProperty(c,actor,id);
  if(!/^[a-f0-9]{64}$/.test(session)||!(await c.query('SELECT app.owner_calendar_authorize($1,$2) allowed',[createHash('sha256').update(session).digest('hex'),id])).rows[0]?.allowed)throw new UnauthorizedException('STAFF_SESSION_REQUIRED');
  // Do not lock the role/session before waiting on inventory: revocation must
  // remain possible during the wait. Recheck the predicate before commit/replay.
  const property=(await c.query('SELECT id,name,timezone FROM properties WHERE id=$1 AND organization_id=$2',[id,actor.organizationId])).rows[0];
  if(!property)throw new NotFoundException('INVENTORY_NOT_FOUND');return property;
 }
 private async current(c:PoolClient,actor:RequestActorContext,id:string,result:any){
  if(result.status==='not_applied')return {...result,currentState:'absent'};
  const row=(await c.query(`SELECT ip.kind,ip.source_ref,ip.reservation_id,ip.expires_at,EXISTS(SELECT 1 FROM outbox_events e WHERE e.organization_id=ip.organization_id AND e.aggregate_id=ip.id AND e.event_type='owner.calendar_blocked' AND e.payload->'period'->>'unitId'=ip.unit_id::text AND e.payload->'period'->>'kind'=ip.kind::text AND ip.stay_period=tstzrange((e.payload->'period'->>'start')::timestamptz,(e.payload->'period'->>'end')::timestamptz,'[)')) original FROM inventory_periods ip WHERE ip.id=$1 AND ip.organization_id=$2 AND ip.property_id=$3`,[result.periodId,actor.organizationId,id])).rows[0];
  const currentState=!row?'absent':row.original&&row.source_ref===source(result.periodId)&&!row.reservation_id&&!row.expires_at&&['host_block','maintenance'].includes(row.kind)?'blocked':'changed';
  return {...result,currentState};
 }
 async list(actor:RequestActorContext,propertyId:string,from:unknown,to:unknown,session?:string){
  this.enabled();const id=calendarId(propertyId),window=calendarWindow(from,to);
  return this.db.withActor(actor,async c=>{
   await c.query("SET LOCAL statement_timeout='5s'");const p=await this.authorize(c,actor,id,session);
   const units=(await c.query("SELECT id,code,status FROM units WHERE property_id=$1 ORDER BY code,id LIMIT 101",[id])).rows;
   const periods=(await c.query(`SELECT ip.id,ip.unit_id AS "unitId",ip.kind,lower(ip.stay_period) AS start,upper(ip.stay_period) AS end,ip.expires_at AS "expiresAt",
    (ip.kind IN ('host_block','maintenance') AND ip.reservation_id IS NULL AND ip.expires_at IS NULL AND ip.source_ref='owner-calendar:'||ip.id::text AND EXISTS(
      SELECT 1 FROM outbox_events e WHERE e.organization_id=ip.organization_id AND e.aggregate_id=ip.id AND e.event_type='owner.calendar_blocked'
      AND e.payload->'period'->>'unitId'=ip.unit_id::text AND e.payload->'period'->>'kind'=ip.kind::text AND ip.stay_period=tstzrange((e.payload->'period'->>'start')::timestamptz,(e.payload->'period'->>'end')::timestamptz,'[)'))) AS "canRemove"
    FROM inventory_periods ip WHERE ip.organization_id=$1 AND ip.property_id=$2 AND ip.unit_id=ANY($3::uuid[]) AND ip.stay_period&&tstzrange($4::timestamptz,$5::timestamptz,'[)') ORDER BY lower(ip.stay_period),ip.id LIMIT 1001`,[actor.organizationId,id,units.slice(0,100).map(u=>u.id),window.start,window.end])).rows;
   await this.authorize(c,actor,id,session);
   return {recoveryScope:{organizationId:actor.organizationId,userId:actor.userId,membershipId:actor.membershipId,propertyId:id},property:{id:p.id,name:p.name,timezone:p.timezone},units:units.slice(0,100),periods:periods.slice(0,1000),unitsTruncated:units.length>100,periodsTruncated:periods.length>1000,window};
  });
 }
 async mutate(actor:RequestActorContext,propertyId:string,raw:unknown,key:string,session?:string){
  this.enabled();const id=calendarId(propertyId),{input,recoveryOnly}=calendarRequest(raw);
  if(typeof key!=='string'||! /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(key))throw new BadRequestException('IDEMPOTENCY_KEY_REQUIRED');
  const eventKey='owner-calendar-command:'+actor.organizationId+':'+actor.membershipId+':'+key.toLowerCase(),hash=inventoryHash({propertyId:id,input});
  return this.db.withActor(actor,async c=>{
   await c.query("SET LOCAL statement_timeout='10s'");await this.authorize(c,actor,id,session);
   await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[eventKey]);
   await this.authorize(c,actor,id,session);
   const prior=(await c.query('SELECT payload FROM outbox_events WHERE organization_id=$1 AND idempotency_key=$2',[actor.organizationId,eventKey])).rows[0]?.payload;
   if(prior){if(prior.inputHash!==hash)throw new ConflictException('IDEMPOTENCY_CONFLICT');const result=await this.current(c,actor,id,prior.result);await this.authorize(c,actor,id,session);return {...result,idempotentReplay:true};}
   if(recoveryOnly){
    const result={propertyId:id,periodId:null,status:'not_applied',currentState:'absent',idempotentReplay:false};
    await c.query(`INSERT INTO outbox_events(organization_id,aggregate_type,aggregate_id,event_type,idempotency_key,payload) VALUES($1,'inventory_period',$2,'owner.calendar_not_applied',$3,$4)`,[actor.organizationId,randomUUID(),eventKey,{inputHash:hash,result}]);
    await this.authorize(c,actor,id,session);return result;
   }
   let periodId:string,period:{unitId:string;kind:string;start:string;end:string};
   if(input.action==='block'){
    const unit=(await c.query('SELECT status FROM units WHERE property_id=$1 AND id=$2 FOR UPDATE',[id,input.unitId])).rows[0];
    if(!unit||unit.status!=='active')throw new ConflictException('CALENDAR_UNIT_UNAVAILABLE');
    periodId=randomUUID();period={unitId:input.unitId,kind:input.kind,start:input.start,end:input.end};
    await c.query(`INSERT INTO inventory_periods(id,organization_id,property_id,unit_id,kind,source_ref,stay_period) VALUES($1,$2,$3,$4,$5,$6,tstzrange($7::timestamptz,$8::timestamptz,'[)'))`,[periodId,actor.organizationId,id,input.unitId,input.kind,source(periodId),input.start,input.end]);
   }else{
    periodId=input.periodId;
    const origin=(await c.query("SELECT payload->'period' period FROM outbox_events WHERE organization_id=$1 AND aggregate_id=$2 AND event_type='owner.calendar_blocked'",[actor.organizationId,periodId])).rows[0]?.period;
    if(!origin)throw new NotFoundException('CALENDAR_BLOCK_NOT_FOUND');
    // Match the original immutable event as well as the marker; never release a
    // booking, provider calendar, expired hold or a block changed by another system.
    await c.query('SELECT id FROM units WHERE property_id=$1 AND id=$2 FOR UPDATE',[id,origin.unitId]);
    const removed=await c.query(`DELETE FROM inventory_periods WHERE id=$1 AND organization_id=$2 AND property_id=$3 AND unit_id=$4 AND kind=$5 AND kind IN ('host_block','maintenance') AND source_ref=$6 AND reservation_id IS NULL AND expires_at IS NULL AND stay_period=tstzrange($7::timestamptz,$8::timestamptz,'[)') RETURNING id`,[periodId,actor.organizationId,id,origin.unitId,origin.kind,source(periodId),origin.start,origin.end]);
    if(!removed.rowCount)throw new NotFoundException('CALENDAR_BLOCK_NOT_FOUND');period=origin;
   }
   const event=input.action==='block'?'owner.calendar_blocked':'owner.calendar_unblocked',result={propertyId:id,periodId,status:input.action==='block'?'blocked':'unblocked',idempotentReplay:false,currentState:input.action==='block'?'blocked':'absent'};
   await c.query(`INSERT INTO audit_log(organization_id,actor_user_id,actor_membership_id,request_id,action,entity_type,entity_id,before_state,after_state) VALUES($1,$2,$3,$4,$5,'inventory_period',$6,$7,$8)`,[actor.organizationId,actor.userId,actor.membershipId,actor.requestId,event,periodId,input.action==='unblock'?period:null,input.action==='block'?period:null]);
   await c.query(`INSERT INTO outbox_events(organization_id,aggregate_type,aggregate_id,event_type,idempotency_key,payload) VALUES($1,'inventory_period',$2,$3,$4,$5)`,[actor.organizationId,periodId,event,eventKey,{inputHash:hash,result,period}]);await this.authorize(c,actor,id,session);return result;
  }).catch(error=>{if(error?.code==='23P01')throw new ConflictException('CALENDAR_PERIOD_CONFLICT');throw error;});
 }
}
