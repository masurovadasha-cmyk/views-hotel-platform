import {Injectable,UnauthorizedException} from '@nestjs/common';
import {DatabaseService} from '../database/database.service';
import {GuestEmailService} from '../guest-identity/guest-email.service';
import {StaffAuthService} from '../staff-auth/staff-auth.service';
import type {RequestActorContext} from '../identity/actor-context';
import {enabled,hash,safe} from './service-order.service';
import {uuid} from './service-order.input';
import {knowledgeInput,preferenceInput,searchInput} from './concierge-support.input';
export type KnowledgeArticle={id:string;language:'ru'|'uz'|'en';title:string;content:string;active:boolean;revision:number;updated_at:string};
export type Preferences={reservationId:string;revision:number;consent:boolean;preferences?:string;idempotentReplay?:boolean};
export type GuestContext={reservationId:string;guestName:string;confirmationCode:string;unitCode:string|null;consent:boolean;preferences:string};
@Injectable()
export class ConciergeSupportService{
 constructor(private readonly db:DatabaseService,private readonly guest:GuestEmailService,private readonly staff:StaffAuthService){}
 private async identity(actor:RequestActorContext,token:string){enabled();const who=await this.staff.resolve(token);if(who.organizationId!==actor.organizationId||who.userId!==actor.userId||who.membershipId!==actor.membershipId)throw new UnauthorizedException('STAFF_ACTOR_MISMATCH');}
 async knowledge(actor:RequestActorContext,token:string,property:unknown,cursor?:unknown,search?:unknown){await this.identity(actor,token);const p=uuid(property),after=cursor===undefined?null:uuid(cursor),q=searchInput(search);return safe(()=>this.db.withActor(actor,async c=>{const r=(await c.query<{value:{items:KnowledgeArticle[]}}>('SELECT app.concierge_knowledge_list($1,$2,$3,$4) value',[hash(token),p,after,q])).rows[0].value,items=r.items.slice(0,10);return {items,nextCursor:r.items.length>10?items.at(-1)!.id:null};}));}
 async saveKnowledge(actor:RequestActorContext,token:string,property:unknown,key:unknown,raw:unknown){await this.identity(actor,token);const p=uuid(property),k=uuid(key),body=knowledgeInput(raw);return safe(()=>this.db.withActor(actor,async c=>{await c.query("SET LOCAL statement_timeout='10s'");return (await c.query<{value:{id:string;revision:number;active:boolean;idempotentReplay:boolean}}>('SELECT app.concierge_knowledge_save($1,$2,$3,$4) value',[hash(token),p,k,body])).rows[0].value;}));}
 async context(actor:RequestActorContext,token:string,id:unknown){await this.identity(actor,token);const oid=uuid(id);return safe(()=>this.db.withActor(actor,async c=>(await c.query<{value:GuestContext}>('SELECT app.concierge_guest_context($1,$2) value',[hash(token),oid])).rows[0].value));}
 async preferences(token:string,reservation:unknown){enabled();await this.guest.session(token);const r=uuid(reservation);return safe(async()=>(await this.db.query<{value:Preferences}>('SELECT app.concierge_preferences($1,$2) value',[hash(token),r])).rows[0].value);}
 async savePreferences(token:string,key:unknown,raw:unknown){enabled();await this.guest.session(token);const k=uuid(key),body=preferenceInput(raw);return safe(()=>this.db.withOrganization('',async c=>{await c.query("SET LOCAL statement_timeout='10s'");return (await c.query<{value:Preferences}>('SELECT app.concierge_preferences_save($1,$2,$3) value',[hash(token),k,body])).rows[0].value;}));}
}
