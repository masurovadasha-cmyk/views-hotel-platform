import {Injectable,NotFoundException,UnauthorizedException,BadRequestException,ConflictException} from '@nestjs/common';
import {createHash} from 'node:crypto';
import {DatabaseService} from '../database/database.service';
import type {RequestActorContext} from '../identity/actor-context';
import {decisionInput,offerInput,id,query} from './partner.input';
function hash(token:unknown){if(typeof token!=='string'||! /^[a-f0-9]{64}$/.test(token))throw new UnauthorizedException('PARTNER_SESSION_REQUIRED');return createHash('sha256').update(token).digest('hex');}
export function partnerEnabled(){if(process.env.NODE_ENV!=='test'||process.env.VIEWS_LOCAL_REHEARSAL!=='true'||process.env.VIEWS_PARTNER_PILOT_ENABLED!=='true')throw new NotFoundException('PARTNER_PILOT_DISABLED');}
async function safe<T>(fn:()=>Promise<T>):Promise<T>{try{return await fn();}catch(error:any){
 if(error?.code==='28000')throw new UnauthorizedException('PARTNER_SESSION_REQUIRED');
 if(error?.code==='P0002'||error?.code==='42501')throw new NotFoundException('PARTNER_NOT_FOUND');
 if(['22023','22P02','22007','22008'].includes(error?.code))throw new BadRequestException('PARTNER_INPUT_INVALID');
 if(error?.code==='23514')throw new ConflictException(/^PARTNER_[A-Z_]+$/.test(error.message)?error.message:'PARTNER_TRANSITION_INVALID');
 if(error?.code==='23505')throw new ConflictException('PARTNER_ALREADY_ASSIGNED');throw error;
}}
@Injectable()
export class PartnerService{
 constructor(private readonly db:DatabaseService){}
 async dispatch(actor:RequestActorContext,token:unknown,q:Record<string,unknown>){partnerEnabled();query(q,['propertyId','after']);const session=hash(token),property=id(q.propertyId),after=q.after===undefined?null:id(q.after);return safe(()=>this.db.withActor(actor,async c=>{await c.query("SET LOCAL statement_timeout='5s'");return (await c.query('SELECT app.partner_dispatch_list($1,$2,$3) result',[session,property,after])).rows[0].result;}));}
 async offer(actor:RequestActorContext,token:unknown,key:unknown,raw:unknown){partnerEnabled();const session=hash(token),command=id(key),body=offerInput(raw);return safe(()=>this.db.withActor(actor,async c=>{await c.query("SET LOCAL statement_timeout='10s'");return (await c.query('SELECT app.partner_offer($1,$2,$3) result',[session,command,body])).rows[0].result;}));}
 async list(token:unknown,q:Record<string,unknown>){partnerEnabled();query(q,['after']);const session=hash(token),after=q.after===undefined?null:id(q.after);return safe(()=>this.db.withOrganization('',async c=>{await c.query("SET LOCAL statement_timeout='5s'");return (await c.query('SELECT app.partner_assignment_list($1,$2) result',[session,after])).rows[0].result;}));}
 async decide(token:unknown,assignment:unknown,key:unknown,raw:unknown){partnerEnabled();const session=hash(token),target=id(assignment),command=id(key),body=decisionInput(raw);return safe(()=>this.db.withOrganization('',async c=>{await c.query("SET LOCAL statement_timeout='10s'");return (await c.query('SELECT app.partner_decide($1,$2,$3,$4) result',[session,target,command,body])).rows[0].result;}));}
}
