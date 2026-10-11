import {Injectable,UnauthorizedException} from '@nestjs/common';
import {DatabaseService} from '../database/database.service';
import {GuestEmailService} from '../guest-identity/guest-email.service';
import {StaffAuthService} from '../staff-auth/staff-auth.service';
import type {RequestActorContext} from '../identity/actor-context';
import {enabled,hash,safe} from './service-order.service';
import {uuid} from './service-order.input';
import {laundryRequest,laundryAction} from './laundry.input';
export type LaundryReceipt={intakeId:string;stage:string;revision:number;orderId:string|null;estimateMinor:string;totalMinor:string|null;items:{tag:string;description:string;priceMinor:string}[]|null;idempotentReplay:boolean};
@Injectable()
export class LaundryService{
 constructor(private readonly db:DatabaseService,private readonly guest:GuestEmailService,private readonly staff:StaffAuthService){}
 async catalog(token:string,reservation:unknown,after?:unknown){enabled();await this.guest.session(token);const r=uuid(reservation),cursor=after===undefined?null:uuid(after);return safe(async()=>{const raw=(await this.db.query<{value:{items:{id:string;name:Record<string,string>;priceMinor:string;currency:string;revision:number}[]}}>('SELECT app.laundry_catalog($1,$2,$3) value',[hash(token),r,cursor])).rows[0].value;const items=raw.items.slice(0,50);return {items,nextCursor:raw.items.length>50?items.at(-1)!.id:null};});}
 async request(token:string,key:unknown,raw:unknown){enabled();await this.guest.session(token);const body=laundryRequest(raw),command=uuid(key);return safe(()=>this.db.withOrganization('',async c=>{await c.query("SET LOCAL statement_timeout='10s'");return (await c.query<{value:LaundryReceipt}>('SELECT app.laundry_request($1,$2,$3) value',[hash(token),command,body])).rows[0].value;}));}
 async guestAct(token:string,id:unknown,key:unknown,raw:unknown){enabled();await this.guest.session(token);const iid=uuid(id),command=uuid(key),body=laundryAction(raw,false);return safe(()=>this.db.withOrganization('',async c=>{await c.query("SET LOCAL statement_timeout='10s'");return (await c.query<{value:LaundryReceipt}>('SELECT app.laundry_guest_act($1,$2,$3,$4) value',[hash(token),iid,command,body])).rows[0].value;}));}
 private async identity(actor:RequestActorContext,token:string){enabled();const who=await this.staff.resolve(token);if(who.organizationId!==actor.organizationId||who.userId!==actor.userId||who.membershipId!==actor.membershipId)throw new UnauthorizedException('STAFF_ACTOR_MISMATCH');}
 async staffAct(actor:RequestActorContext,token:string,id:unknown,key:unknown,raw:unknown){await this.identity(actor,token);const iid=uuid(id),command=uuid(key),body=laundryAction(raw,true);return safe(()=>this.db.withActor(actor,async c=>{await c.query("SET LOCAL statement_timeout='10s'");return (await c.query<{value:LaundryReceipt}>('SELECT app.laundry_staff_act($1,$2,$3,$4) value',[hash(token),iid,command,body])).rows[0].value;}));}
 async guestList(token:string,reservation:unknown,after?:unknown){enabled();await this.guest.session(token);const r=uuid(reservation),cursor=after===undefined?null:uuid(after);return safe(async()=>this.page((await this.db.query<{value:{items:LaundryReceipt[]}}>('SELECT app.laundry_guest_list($1,$2,$3) value',[hash(token),r,cursor])).rows[0].value));}
 async staffList(actor:RequestActorContext,token:string,property:unknown,after?:unknown){await this.identity(actor,token);const p=uuid(property),cursor=after===undefined?null:uuid(after);return safe(()=>this.db.withActor(actor,async c=>this.page((await c.query<{value:{items:LaundryReceipt[]}}>('SELECT app.laundry_staff_list($1,$2,$3) value',[hash(token),p,cursor])).rows[0].value)));}
 private page(raw:{items:LaundryReceipt[]}){const items=raw.items.slice(0,50);return {items,nextCursor:raw.items.length>50?items.at(-1)!.intakeId:null};}
}
