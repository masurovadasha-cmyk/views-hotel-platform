import {ConflictException,ForbiddenException,NotFoundException} from '@nestjs/common';
import {randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import type {RequestActorContext} from '../identity/actor-context';
export const mode='operational_charges' as const;
export function enabled(){if(process.env.NODE_ENV!=='test'||process.env.VIEWS_LOCAL_REHEARSAL!=='true'||process.env.VIEWS_FOLIO_PILOT_ENABLED!=='true')throw new NotFoundException('FOLIO_DISABLED');}
export async function scope(c:PoolClient,a:RequestActorContext,property:string,write=false){await c.query("SET LOCAL statement_timeout='30s'");if(!(await c.query('SELECT app.folio_operation_access($1,$2,$3) allowed',[a.organizationId,property,write])).rows[0].allowed)throw new ForbiddenException('PROPERTY_FORBIDDEN');}
export type Booking={id:string;property_id:string;confirmation_code:string;currency:string;status:string};
export async function booking(c:PoolClient,a:RequestActorContext,target:string,write=false){const r=(await c.query<Booking>(`SELECT id,property_id,confirmation_code,currency,status FROM reservations WHERE id=$1 AND organization_id=$2 ${write?'FOR UPDATE':''}`,[target,a.organizationId])).rows[0];if(!r)throw new NotFoundException('FOLIO_NOT_FOUND');await scope(c,a,r.property_id,write);return r;}
export async function openFolio(c:PoolClient,a:RequestActorContext,r:Booking){if(!['confirmed','checked_in','checked_out'].includes(r.status))throw new ConflictException('FOLIO_NOT_OPEN');const existing=(await c.query<{id:string;status:string}>('SELECT id,status FROM guest_folios WHERE organization_id=$1 AND reservation_id=$2 FOR UPDATE',[a.organizationId,r.id])).rows[0];if(existing){if(existing.status!=='open')throw new ConflictException('FOLIO_NOT_OPEN');return existing.id;}
 if(!['confirmed','checked_in','checked_out'].includes(r.status))throw new ConflictException('FOLIO_NOT_OPEN');
 return (await c.query<{id:string}>('INSERT INTO guest_folios(organization_id,property_id,reservation_id,currency) VALUES($1,$2,$3,$4) RETURNING id',[a.organizationId,r.property_id,r.id,r.currency])).rows[0].id;
}
export async function replay<T>(c:PoolClient,a:RequestActorContext,property:string,key:string,payload:unknown){await scope(c,a,property,true);await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['folio:'+a.organizationId+':'+key]);const old=(await c.query<{actor_user_id:string;actor_membership_id:string;matches:boolean;result:Record<string,unknown>}>('SELECT actor_user_id,actor_membership_id,payload=$3::jsonb matches,result FROM folio_commands WHERE organization_id=$1 AND command_key=$2',[a.organizationId,key,JSON.stringify(payload)])).rows[0];if(!old)return null;if(!old.matches||old.actor_user_id!==a.userId||old.actor_membership_id!==a.membershipId)throw new ConflictException('FOLIO_COMMAND_CONFLICT');return {...old.result,idempotentReplay:true} as T & {idempotentReplay:true};}
export async function record(c:PoolClient,a:RequestActorContext,property:string,key:string,payload:unknown,result:unknown,action:string,entity:string){
 await c.query('INSERT INTO folio_commands(organization_id,property_id,command_key,actor_user_id,actor_membership_id,payload,result) VALUES($1,$2,$3,$4,$5,$6,$7)',[a.organizationId,property,key,a.userId,a.membershipId,payload,result]);
 await c.query("INSERT INTO audit_log(organization_id,actor_user_id,actor_membership_id,request_id,action,entity_type,entity_id,after_state) VALUES($1,$2,$3,$4,$5,'folio',$6,$7)",[a.organizationId,a.userId,a.membershipId,a.requestId,action,entity,result]);
 await c.query("INSERT INTO outbox_events(organization_id,aggregate_type,aggregate_id,event_type,idempotency_key,payload) VALUES($1,'folio',$2,$3,$4,$5)",[a.organizationId,entity,action,'folio-command:'+a.organizationId+':'+key,result]);
}
export function entryId(){return randomUUID();}
