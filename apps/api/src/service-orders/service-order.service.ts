import {BadRequestException,ConflictException,ForbiddenException,Injectable,NotFoundException,UnauthorizedException} from '@nestjs/common';
import {createHash} from 'node:crypto';
import {DatabaseService} from '../database/database.service';
import {GuestEmailService} from '../guest-identity/guest-email.service';
import {StaffAuthService} from '../staff-auth/staff-auth.service';
import type {RequestActorContext} from '../identity/actor-context';
import {actionInput,guestChangeInput,requestInput,uuid} from './service-order.input';
export type ServiceReceipt={orderId:string;status:string;stage:string;revision:number;folioEntryId?:string|null;currency?:string;totalMinor?:string;idempotentReplay:boolean};
type PageRow={id?:string;orderId?:string;[key:string]:unknown};
const hash=(token:string)=>createHash('sha256').update(token).digest('hex');
function enabled(){if(process.env.NODE_ENV!=='test'||process.env.VIEWS_LOCAL_REHEARSAL!=='true'||process.env.VIEWS_SERVICE_ORDER_PILOT_ENABLED!=='true')throw new NotFoundException('SERVICE_ORDERS_DISABLED');}
async function safe<T>(work:()=>Promise<T>):Promise<T>{try{return await work();}catch(e){const error=e as {code?:string;message?:string};const message=error.message?.match(/^(?:SERVICE_[A-Z_]+|FOLIO_NOT_OPEN)$/)?.[0]||'SERVICE_OPERATION_FAILED';if(error.code==='28000')throw new UnauthorizedException(message);if(error.code==='42501')throw new ForbiddenException(message);if(error.code==='P0002')throw new NotFoundException(message);if(error.code==='23P01')throw new ConflictException('SERVICE_ASSIGNEE_BUSY');if(error.code==='23514'||error.code==='23505')throw new ConflictException(message);if(error.code?.startsWith('22'))throw new BadRequestException('SERVICE_INPUT_INVALID');throw e;}}
function page(raw:{items:PageRow[]}){const items=raw.items.slice(0,50),last=items.at(-1);return {items,nextCursor:raw.items.length>50?(last?.orderId??last?.id??null):null};}
@Injectable()
export class ServiceOrderService{
 constructor(private readonly db:DatabaseService,private readonly guest:GuestEmailService,private readonly staff:StaffAuthService){}
 private async guestRead(kind:'catalog'|'orders',token:string,reservation:unknown,after?:unknown){enabled();await this.guest.session(token);const r=uuid(reservation),cursor=after===undefined?null:uuid(after);return safe(async()=>page((await this.db.query<{value:{items:PageRow[]}}>(`SELECT app.guest_cleaning_${kind}($1,$2,$3) value`,[hash(token),r,cursor])).rows[0].value));}
 catalog(token:string,reservation:unknown,after?:unknown){return this.guestRead('catalog',token,reservation,after);}
 orders(token:string,reservation:unknown,after?:unknown){return this.guestRead('orders',token,reservation,after);}
 async change(token:string,order:unknown,key:unknown,raw:unknown){enabled();await this.guest.session(token);const id=uuid(order),command=uuid(key),body=guestChangeInput(raw);return safe(()=>this.db.withOrganization('',async c=>{await c.query("SET LOCAL statement_timeout='10s'");return (await c.query<{value:ServiceReceipt}>('SELECT app.guest_cleaning_change($1,$2,$3,$4) value',[hash(token),id,command,body])).rows[0].value;}));}
 async request(token:string,key:unknown,raw:unknown){enabled();await this.guest.session(token);const body=requestInput(raw),command=uuid(key);return safe(()=>this.db.withOrganization('',async c=>{await c.query("SET LOCAL statement_timeout='10s'");return (await c.query<{value:ServiceReceipt}>('SELECT app.guest_cleaning_request($1,$2,$3) value',[hash(token),command,body])).rows[0].value;}));}
 private async staffActor(actor:RequestActorContext,token:string){enabled();const identity=await this.staff.resolve(token);if(identity.organizationId!==actor.organizationId||identity.userId!==actor.userId||identity.membershipId!==actor.membershipId)throw new UnauthorizedException('STAFF_ACTOR_MISMATCH');}
 async assignees(actor:RequestActorContext,token:string,property:unknown){await this.staffActor(actor,token);const p=uuid(property);return safe(()=>this.db.withActor(actor,async c=>(await c.query('SELECT app.cleaning_assignees($1,$2) value',[hash(token),p])).rows[0].value));}
 async queue(actor:RequestActorContext,token:string,property:unknown,after?:unknown){await this.staffActor(actor,token);const p=uuid(property),cursor=after===undefined?null:uuid(after);return safe(()=>this.db.withActor(actor,async c=>page((await c.query('SELECT app.staff_cleaning_queue($1,$2,$3) value',[hash(token),p,cursor])).rows[0].value)));}
 async act(actor:RequestActorContext,token:string,order:unknown,key:unknown,raw:unknown){await this.staffActor(actor,token);const id=uuid(order),command=uuid(key),body=actionInput(raw);return safe(()=>this.db.withActor(actor,async c=>{await c.query("SET LOCAL statement_timeout='10s'");return (await c.query<{value:ServiceReceipt}>('SELECT app.staff_cleaning_act($1,$2,$3,$4) value',[hash(token),id,command,body])).rows[0].value;}));}
}
