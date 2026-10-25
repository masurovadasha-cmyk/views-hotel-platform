import {Injectable,UnauthorizedException} from '@nestjs/common';
import {DatabaseService} from '../database/database.service';
import {StaffAuthService} from '../staff-auth/staff-auth.service';
import type {RequestActorContext} from '../identity/actor-context';
import {enabled,hash,safe} from './service-order.service';
import {invalid,uuid} from './service-order.input';
import {conciergeSla} from './concierge-sla';
export const queueKinds=['cleaning','laundry','market','concierge'] as const;
export type QueueKind=typeof queueKinds[number];
const sources={cleaning:{fn:'staff_cleaning_queue',limit:50,permissions:['reservation.manage','housekeeping.work']},laundry:{fn:'laundry_staff_list',limit:2,permissions:['reservation.manage']},market:{fn:'market_staff_list',limit:50,permissions:['stock.manage']},concierge:{fn:'concierge_staff_list',limit:2,permissions:['reservation.manage','concierge.work']}};
export function queueQuery(q:Record<string,unknown>){
 if(Object.keys(q).some(k=>!['propertyId','kind','cursor'].includes(k)))invalid();
 const propertyId=uuid(q.propertyId);
 if(q.kind!==undefined&&(typeof q.kind!=='string'||!queueKinds.includes(q.kind as QueueKind)))invalid();
 if(q.cursor!==undefined&&q.kind===undefined)invalid();
 return {propertyId,kind:q.kind as QueueKind|undefined,cursor:q.cursor===undefined?null:uuid(q.cursor)};
}
export type QueueRow={id:string;kind:QueueKind;stage:string;revision:number;unitCode:string|null;sla:ReturnType<typeof conciergeSla>|null};
export type QueueSection={kind:QueueKind;status:'available'|'forbidden'|'disabled';items:QueueRow[];nextCursor:string|null};
/** Only an allow-listed minimal projection leaves this boundary. No messages, guest IDs or money. */
export function queueRow(kind:QueueKind,row:Record<string,unknown>,now:Date):QueueRow{
 const id=uuid(kind==='laundry'?row.intakeId:row.orderId);
 if(typeof row.stage!=='string'||!/^[a-z_]{1,50}$/.test(row.stage)||!Number.isSafeInteger(row.revision)||Number(row.revision)<1)throw new Error('QUEUE_RESPONSE_INVALID');
 if(row.unitCode!=null&&(typeof row.unitCode!=='string'||row.unitCode.length>120))throw new Error('QUEUE_RESPONSE_INVALID');
 let sla:QueueRow['sla']=null;
 if(kind==='concierge'){
  if(typeof row.responseDueAt!=='string'||!Number.isFinite(Date.parse(row.responseDueAt))||(row.answeredAt!==null&&(typeof row.answeredAt!=='string'||!Number.isFinite(Date.parse(row.answeredAt)))))throw new Error('QUEUE_RESPONSE_INVALID');
  sla=conciergeSla({stage:row.stage,responseDueAt:row.responseDueAt,answeredAt:row.answeredAt as string|null},now);
 }
 return {id,kind,stage:row.stage,revision:Number(row.revision),unitCode:row.unitCode as string??null,sla};
}
@Injectable()
export class OperationsQueueService{
 constructor(private readonly db:DatabaseService,private readonly staff:StaffAuthService){}
 async list(actor:RequestActorContext,token:string,query:Record<string,unknown>){
  enabled();const q=queueQuery(query),who=await this.staff.resolve(token);
  if(who.organizationId!==actor.organizationId||who.userId!==actor.userId||who.membershipId!==actor.membershipId)throw new UnauthorizedException('STAFF_ACTOR_MISMATCH');
  return safe(()=>this.db.withActor(actor,async c=>{
   await c.query("SET LOCAL statement_timeout='10s'");
   const sections:QueueSection[]=[];
   for(const kind of q.kind?[q.kind]:queueKinds){
    const source=sources[kind];
    const access=(await c.query<{allowed:boolean}>('SELECT EXISTS(SELECT 1 FROM unnest($3::text[]) permission WHERE app.registry_access($1,$2,permission)) allowed',[actor.organizationId,q.propertyId,source.permissions])).rows[0].allowed;
    if(!access){sections.push({kind,status:'forbidden',items:[],nextCursor:null});continue;}
    if(kind==='market'&&process.env.VIEWS_MARKET_PILOT_ENABLED!=='true'){sections.push({kind,status:'disabled',items:[],nextCursor:null});continue;}
    // Function name is a fixed internal allow-list. Each function rechecks session, property and assignment scope.
    const raw=(await c.query<{value:{items:Record<string,unknown>[]}}>(`SELECT app.${source.fn}($1,$2,$3) value`,[hash(token),q.propertyId,q.cursor])).rows[0].value;
    if(!Array.isArray(raw.items)||raw.items.length>source.limit+1)throw new Error('QUEUE_RESPONSE_INVALID');
    const items=raw.items.slice(0,source.limit).map(row=>queueRow(kind,row,new Date()));
    sections.push({kind,status:'available',items,nextCursor:raw.items.length>source.limit?items.at(-1)!.id:null});
   }
   return {sections};
  }));
 }
}
