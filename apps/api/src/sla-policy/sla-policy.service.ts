import {Injectable,NotFoundException,ForbiddenException,ConflictException,BadRequestException,UnauthorizedException} from '@nestjs/common';
import {createHash} from 'node:crypto';
import type {PoolClient} from 'pg';
import {DatabaseService} from '../database/database.service';
import type {RequestActorContext} from '../identity/actor-context';
import {exact,policy,simulate,type Policy} from './calendar';
const uuid=(x:unknown)=>{if(typeof x!=='string'||! /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(x))throw new BadRequestException('INVALID_SLA_ID');return x.toLowerCase();};
const digest=(x:string)=>createHash('sha256').update(x).digest('hex');
export function draftCommand(raw:unknown){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new BadRequestException('INVALID_SLA_POLICY');
 const {recoveryOnly,...body}=raw as Record<string,unknown>;
 if(recoveryOnly!==undefined&&recoveryOnly!==true)throw new BadRequestException('INVALID_RECOVERY_MODE');
 exact(body,['propertyId','expectedRevision','policy']);if(!Number.isSafeInteger(body.expectedRevision)||Number(body.expectedRevision)<0||Number(body.expectedRevision)>1000000)throw new BadRequestException('INVALID_SLA_REVISION');
 return {propertyId:uuid(body.propertyId),expectedRevision:Number(body.expectedRevision),policy:policy(body.policy),recoveryOnly:recoveryOnly===true};
}
@Injectable()
export class SlaPolicyService{
 constructor(private readonly db:DatabaseService){}
 private enabled(){if(process.env.NODE_ENV!=='test'||process.env.VIEWS_LOCAL_REHEARSAL!=='true'||process.env.VIEWS_SLA_POLICY_DRAFT_ENABLED!=='true')throw new NotFoundException('SLA_POLICY_DISABLED');}
 private async authorize(c:PoolClient,a:RequestActorContext,propertyId:string,token:string){
  if(!/^[a-f0-9]{64}$/.test(token))throw new UnauthorizedException('STAFF_SESSION_REQUIRED');
  if(!(await c.query('SELECT app.booking_hold_authorize($1,$2) allowed',[digest(token),propertyId])).rows[0]?.allowed)throw new ForbiddenException('SLA_POLICY_FORBIDDEN');
  if(!(await c.query('SELECT 1 FROM properties WHERE id=$1 AND organization_id=$2',[propertyId,a.organizationId])).rowCount)throw new ForbiddenException('SLA_POLICY_FORBIDDEN');
 }
 private async latest(c:PoolClient,a:RequestActorContext,property:string,p:Policy){return (await c.query('SELECT revision,config,created_at AS "createdAt" FROM sla_policy_draft_versions WHERE organization_id=$1 AND property_id=$2 AND service_kind=$3 AND milestone=$4 ORDER BY revision DESC LIMIT 1',[a.organizationId,property,p.serviceKind,p.milestone])).rows[0]||null;}
 async list(a:RequestActorContext,property:string,token:string){this.enabled();const id=uuid(property);return this.db.withActor(a,async c=>{await this.authorize(c,a,id,token);const rows=(await c.query('SELECT DISTINCT ON(service_kind,milestone) revision,config,created_at AS "createdAt" FROM sla_policy_draft_versions WHERE organization_id=$1 AND property_id=$2 ORDER BY service_kind,milestone,revision DESC',[a.organizationId,id])).rows;await this.authorize(c,a,id,token);return {draftOnly:true,approved:false,recoveryScope:{organizationId:a.organizationId,userId:a.userId,membershipId:a.membershipId,propertyId:id},policies:rows};});}
 async save(a:RequestActorContext,token:string,key:string,raw:unknown){this.enabled();const k=uuid(key),v=draftCommand(raw),hash=digest(JSON.stringify({propertyId:v.propertyId,expectedRevision:v.expectedRevision,policy:v.policy}));return this.db.withActor(a,async c=>{
  await c.query("SET LOCAL statement_timeout='10s'");await this.authorize(c,a,v.propertyId,token);
  await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[a.organizationId+':sla-command:'+k]);
  await this.authorize(c,a,v.propertyId,token);
  await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[a.organizationId+':sla-policy:'+v.propertyId+':'+v.policy.serviceKind+':'+v.policy.milestone]);
  await this.authorize(c,a,v.propertyId,token);
  const prior=(await c.query('SELECT request_hash,outcome,applied_revision FROM sla_policy_draft_commands WHERE organization_id=$1 AND command_key=$2',[a.organizationId,k])).rows[0];
  if(prior&&prior.request_hash!==hash)throw new ConflictException('IDEMPOTENCY_CONFLICT');
  let current=await this.latest(c,a,v.propertyId,v.policy),outcome=prior?.outcome,appliedRevision=prior?.applied_revision??null;
  if(!prior){
   if(v.recoveryOnly)outcome='not_applied';else{
    if((current?.revision??0)!==v.expectedRevision)throw new ConflictException('SLA_REVISION_CONFLICT');
    appliedRevision=v.expectedRevision+1;outcome='saved';
    await c.query('INSERT INTO sla_policy_draft_versions(organization_id,property_id,service_kind,milestone,revision,config,created_by) VALUES($1,$2,$3,$4,$5,$6,$7)',[a.organizationId,v.propertyId,v.policy.serviceKind,v.policy.milestone,appliedRevision,v.policy,a.membershipId]);
    await c.query("INSERT INTO audit_log(organization_id,actor_user_id,actor_membership_id,request_id,action,entity_type,entity_id,after_state) VALUES($1,$2,$3,$4,'sla.draft_saved','property',$5,$6)",[a.organizationId,a.userId,a.membershipId,a.requestId,v.propertyId,{serviceKind:v.policy.serviceKind,milestone:v.policy.milestone,revision:appliedRevision,draftOnly:true}]);
    current=await this.latest(c,a,v.propertyId,v.policy);
   }
   await c.query('INSERT INTO sla_policy_draft_commands(organization_id,command_key,property_id,request_hash,outcome,applied_revision) VALUES($1,$2,$3,$4,$5,$6)',[a.organizationId,k,v.propertyId,hash,outcome,appliedRevision]);
  }
  await this.authorize(c,a,v.propertyId,token);return {draftOnly:true,approved:false,propertyId:v.propertyId,serviceKind:v.policy.serviceKind,milestone:v.policy.milestone,outcome,appliedRevision,current,idempotentReplay:!!prior};
 });}
 async preview(a:RequestActorContext,token:string,raw:unknown){this.enabled();const v=exact(raw,['propertyId','serviceKind','milestone','revision','startLocal']),id=uuid(v.propertyId);if(!Number.isSafeInteger(v.revision)||Number(v.revision)<1||typeof v.startLocal!=='string')throw new BadRequestException('INVALID_SLA_SIMULATION');return this.db.withActor(a,async c=>{await this.authorize(c,a,id,token);const row=(await c.query('SELECT config FROM sla_policy_draft_versions WHERE organization_id=$1 AND property_id=$2 AND service_kind=$3 AND milestone=$4 AND revision=$5',[a.organizationId,id,v.serviceKind,v.milestone,v.revision])).rows[0];if(!row)throw new NotFoundException('SLA_DRAFT_NOT_FOUND');const result=simulate(policy(row.config),v.startLocal as string);await this.authorize(c,a,id,token);return {...result,propertyId:id,serviceKind:v.serviceKind,milestone:v.milestone,revision:v.revision};});}
}
