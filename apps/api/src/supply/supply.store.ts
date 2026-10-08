import {ConflictException,ForbiddenException,NotFoundException} from '@nestjs/common';
import type {PoolClient} from 'pg';
import type {RequestActorContext} from '../identity/actor-context';
export type Actor=RequestActorContext;
export type WritePermission='purchase.manage'|'stock.manage';
export function enabled(){if(process.env.NODE_ENV!=='test'||process.env.VIEWS_LOCAL_REHEARSAL!=='true'||process.env.VIEWS_SUPPLY_PILOT_ENABLED!=='true')throw new NotFoundException('SUPPLY_DISABLED');}
export async function access(c:PoolClient,a:Actor,property:string,permission='supply.read'){
 await c.query("SET LOCAL statement_timeout='15s'");
 if(!(await c.query('SELECT app.registry_access($1,$2,$3) allowed',[a.organizationId,property,permission])).rows[0]?.allowed)throw new ForbiddenException('PROPERTY_FORBIDDEN');
}
export async function replay(c:PoolClient,a:Actor,property:string,key:string,permission:WritePermission,payload:unknown){
 await access(c,a,property,permission);await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['supply:'+a.organizationId+':'+key]);
 const old=(await c.query('SELECT actor_user_id,actor_membership_id,property_id,permission_code,payload=$3::jsonb matches,result FROM supply_commands WHERE organization_id=$1 AND command_key=$2',[a.organizationId,key,JSON.stringify(payload)])).rows[0];
 if(!old)return null;if(!old.matches||old.property_id!==property||old.permission_code!==permission||old.actor_user_id!==a.userId||old.actor_membership_id!==a.membershipId)throw new ConflictException('SUPPLY_COMMAND_CONFLICT');return {...old.result,idempotentReplay:true};
}
export async function record(c:PoolClient,a:Actor,property:string,key:string,permission:WritePermission,payload:unknown,result:unknown,action:string,entityId:string){
 await c.query('INSERT INTO supply_commands(organization_id,property_id,command_key,permission_code,actor_user_id,actor_membership_id,payload,result) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[a.organizationId,property,key,permission,a.userId,a.membershipId,payload,result]);
 await c.query("INSERT INTO audit_log(organization_id,actor_user_id,actor_membership_id,request_id,action,entity_type,entity_id,after_state) VALUES($1,$2,$3,$4,$5,'supply',$6,$7)",[a.organizationId,a.userId,a.membershipId,a.requestId,action,entityId,result]);
 await c.query("INSERT INTO outbox_events(organization_id,aggregate_type,aggregate_id,event_type,idempotency_key,payload) VALUES($1,'supply',$2,$3,$4,$5)",[a.organizationId,entityId,action,'supply:'+a.organizationId+':'+key,result]);
}
export function mapped(e:unknown):never{const err=e as {code?:string;message?:string};if(err.code==='23505')throw new ConflictException('SUPPLY_COMMAND_CONFLICT');if(err.code==='23514'&&['INSUFFICIENT_STOCK','STOCK_LIMIT_EXCEEDED'].includes(err.message||''))throw new ConflictException(err.message);throw e;}
