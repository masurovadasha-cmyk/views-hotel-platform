import {BadRequestException,ConflictException,ForbiddenException,Injectable,NotFoundException} from '@nestjs/common';
import {createHash} from 'node:crypto';
import type {PoolClient} from 'pg';
import {DatabaseService} from '../database/database.service';
import type {RequestActorContext} from '../identity/actor-context';
export type CleaningAction='claim'|'release'|'complete';
@Injectable()
export class HousekeepingService{
 constructor(private readonly db:DatabaseService){}
 private enabled(actor:RequestActorContext){
  if(process.env.NODE_ENV!=='test'||process.env.VIEWS_LOCAL_REHEARSAL!=='true'||process.env.VIEWS_HOUSEKEEPING_PILOT_ENABLED!=='true'||process.env.VIEWS_STAFF_AUTH_ORGANIZATION_ID!==actor.organizationId)throw new NotFoundException('HOUSEKEEPING_DISABLED');
 }
 private async authorize(c:PoolClient,token:string,propertyId:string){
  if(!/^[a-f0-9]{64}$/.test(token)||!(await c.query('SELECT app.housekeeping_authorize($1,$2) allowed',[createHash('sha256').update(token).digest('hex'),propertyId])).rows[0]?.allowed)throw new ForbiddenException('HOUSEKEEPING_FORBIDDEN');
 }
 async list(actor:RequestActorContext,token:string,propertyId:string){
  this.enabled(actor);
  return this.db.withActor(actor,async c=>{
   await c.query("SET LOCAL statement_timeout='5s'");await this.authorize(c,token,propertyId);
   const rows=(await c.query(`SELECT t.reservation_id AS "taskId",u.code AS "unitCode",t.created_at AS "createdAt",
    CASE WHEN t.assigned_membership_id=$3 THEN 'mine' WHEN t.assigned_membership_id IS NULL THEN 'available' ELSE 'assigned' END AS assignment
    FROM local_stay_turnovers t JOIN units u ON u.id=t.unit_id AND u.property_id=t.property_id
    WHERE t.organization_id=$1 AND t.property_id=$2 AND t.status='pending'
    ORDER BY t.created_at,t.reservation_id LIMIT 101`,[actor.organizationId,propertyId,actor.membershipId])).rows;
   return {items:rows.slice(0,100),truncated:rows.length>100,syntheticData:true};
  });
 }
 async act(actor:RequestActorContext,token:string,propertyId:string,taskId:string,action:CleaningAction,key:string){
  this.enabled(actor);
  if(!['claim','release','complete'].includes(action)||! /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(key))throw new BadRequestException('INVALID_HOUSEKEEPING_REQUEST');
  const eventKey='housekeeping:'+actor.organizationId+':'+actor.membershipId+':'+key.toLowerCase();
  return this.db.withActor(actor,async c=>{
   await c.query("SET LOCAL statement_timeout='10s'");await this.authorize(c,token,propertyId);
   await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[eventKey]);
   const r=(await c.query(`SELECT r.unit_id FROM reservations r
    WHERE r.id=$1 AND r.organization_id=$2 AND r.property_id=$3 AND r.status='checked_out'
    AND r.total_minor=0 AND r.quote_snapshot->'localStayPilot'='true'::jsonb FOR UPDATE`,[taskId,actor.organizationId,propertyId])).rows[0];
   if(!r)throw new ForbiddenException('HOUSEKEEPING_TASK_FORBIDDEN');
   await c.query('SELECT id FROM units WHERE id=$1 AND property_id=$2 FOR UPDATE',[r.unit_id,propertyId]);
   const task=(await c.query('SELECT * FROM local_stay_turnovers WHERE reservation_id=$1 AND organization_id=$2 AND property_id=$3 AND unit_id=$4 FOR UPDATE',[taskId,actor.organizationId,propertyId,r.unit_id])).rows[0];
   await this.authorize(c,token,propertyId); // Recheck wall-clock expiry after waits.
   if(!task)throw new ForbiddenException('HOUSEKEEPING_TASK_FORBIDDEN');
   const prior=(await c.query("SELECT payload FROM outbox_events WHERE organization_id=$1 AND idempotency_key=$2 AND event_type='housekeeping.synthetic_task_changed'",[actor.organizationId,eventKey])).rows[0]?.payload;
   if(prior){if(prior.taskId!==taskId||prior.action!==action||prior.propertyId!==propertyId)throw new ConflictException('IDEMPOTENCY_CONFLICT');return {...prior,idempotentReplay:true};}
   if(task.status!=='pending')throw new ConflictException('HOUSEKEEPING_TASK_CHANGED');
   if((await c.query("SELECT 1 FROM reservations WHERE unit_id=$1 AND status='checked_in' LIMIT 1",[r.unit_id])).rowCount)throw new ConflictException('HOUSEKEEPING_UNIT_OCCUPIED');
   if(action==='claim'){
    if(task.assigned_membership_id!==null)throw new ConflictException('HOUSEKEEPING_ALREADY_ASSIGNED');
    await c.query('UPDATE local_stay_turnovers SET assigned_membership_id=$2 WHERE reservation_id=$1',[taskId,actor.membershipId]);
   }else{
    if(task.assigned_membership_id!==actor.membershipId)throw new ForbiddenException('HOUSEKEEPING_NOT_ASSIGNED');
    if(action==='release')await c.query('UPDATE local_stay_turnovers SET assigned_membership_id=NULL WHERE reservation_id=$1',[taskId]);
    else await c.query("UPDATE local_stay_turnovers SET status='completed',completed_at=clock_timestamp(),completed_by=$2 WHERE reservation_id=$1",[taskId,actor.userId]);
   }
   const result={taskId,propertyId,action,status:action==='complete'?'completed':'pending',idempotentReplay:false,syntheticData:true};
   await c.query(`INSERT INTO audit_log(organization_id,actor_user_id,actor_membership_id,request_id,action,entity_type,entity_id,after_state)
    VALUES($1,$2,$3,$4,'housekeeping.synthetic_task_changed','turnover',$5,$6)`,[actor.organizationId,actor.userId,actor.membershipId,actor.requestId,taskId,result]);
   await c.query(`INSERT INTO outbox_events(organization_id,aggregate_type,aggregate_id,event_type,idempotency_key,payload)
    VALUES($1,'turnover',$2,'housekeeping.synthetic_task_changed',$3,$4)`,[actor.organizationId,taskId,eventKey,result]);
   return result;
  });
 }
}
