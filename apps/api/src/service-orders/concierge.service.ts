import {Injectable,NotFoundException,UnauthorizedException} from '@nestjs/common';
import {DatabaseService} from '../database/database.service';
import {GuestEmailService} from '../guest-identity/guest-email.service';
import {StaffAuthService} from '../staff-auth/staff-auth.service';
import type {RequestActorContext} from '../identity/actor-context';
import {enabled as servicesEnabled,hash,safe} from './service-order.service';
import {uuid} from './service-order.input';
import {conciergeRequest,conciergeAction} from './concierge.input';
export type ConciergeReceipt={orderId:string;stage:string;revision:number;idempotentReplay:boolean;messages:{id:string;author:string;text:string}[]};
const enabled=servicesEnabled;
@Injectable()
export class ConciergeService{
 constructor(private readonly db:DatabaseService,private readonly guest:GuestEmailService,private readonly staff:StaffAuthService){}
 async request(token:string,key:unknown,raw:unknown){enabled();await this.guest.session(token);const body=conciergeRequest(raw),command=uuid(key);return safe(()=>this.db.withOrganization('',async c=>{await c.query("SET LOCAL statement_timeout='10s'");return (await c.query<{value:ConciergeReceipt}>('SELECT app.concierge_request($1,$2,$3) value',[hash(token),command,body])).rows[0].value;}));}
 async guestAct(token:string,id:unknown,key:unknown,raw:unknown){enabled();await this.guest.session(token);const oid=uuid(id),command=uuid(key),body=conciergeAction(raw,false);return safe(()=>this.db.withOrganization('',async c=>{await c.query("SET LOCAL statement_timeout='10s'");return (await c.query<{value:ConciergeReceipt}>('SELECT app.concierge_guest_act($1,$2,$3,$4) value',[hash(token),oid,command,body])).rows[0].value;}));}
 private async identity(actor:RequestActorContext,token:string){enabled();const who=await this.staff.resolve(token);if(who.organizationId!==actor.organizationId||who.userId!==actor.userId||who.membershipId!==actor.membershipId)throw new UnauthorizedException('STAFF_ACTOR_MISMATCH');}
 async staffAct(actor:RequestActorContext,token:string,id:unknown,key:unknown,raw:unknown){await this.identity(actor,token);const oid=uuid(id),command=uuid(key),body=conciergeAction(raw,true);return safe(()=>this.db.withActor(actor,async c=>{await c.query("SET LOCAL statement_timeout='10s'");return (await c.query<{value:ConciergeReceipt}>('SELECT app.concierge_staff_act($1,$2,$3,$4) value',[hash(token),oid,command,body])).rows[0].value;}));}
 async guestList(token:string,reservation:unknown,after?:unknown){enabled();await this.guest.session(token);const r=uuid(reservation),cursor=after===undefined?null:uuid(after);return safe(async()=>this.page((await this.db.query<{value:{items:ConciergeReceipt[]}}>('SELECT app.concierge_guest_list($1,$2,$3) value',[hash(token),r,cursor])).rows[0].value));}
 async staffList(actor:RequestActorContext,token:string,property:unknown,after?:unknown){await this.identity(actor,token);const p=uuid(property),cursor=after===undefined?null:uuid(after);return safe(()=>this.db.withActor(actor,async c=>this.page((await c.query<{value:{items:ConciergeReceipt[]}}>('SELECT app.concierge_staff_list($1,$2,$3) value',[hash(token),p,cursor])).rows[0].value)));}
 private page(raw:{items:ConciergeReceipt[]}){const items=raw.items.slice(0,2);return {items,nextCursor:raw.items.length>2?items.at(-1)!.orderId:null};}
}
