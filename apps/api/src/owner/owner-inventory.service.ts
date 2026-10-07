import {ConflictException,ForbiddenException,Injectable,NotFoundException,BadRequestException} from '@nestjs/common';
import {createHash,randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import {DatabaseService} from '../database/database.service';
import type {RequestActorContext} from '../identity/actor-context';
import {inventoryDraft} from './owner-inventory.input';

@Injectable()
export class OwnerInventoryService{
 constructor(private readonly db:DatabaseService){}
 private enabled(){
  if(process.env.NODE_ENV!=='test'||process.env.VIEWS_LOCAL_REHEARSAL!=='true'||process.env.VIEWS_OWNER_INVENTORY_DRAFT_ENABLED!=='true')throw new NotFoundException('OWNER_INVENTORY_DISABLED');
 }
 private async authorize(c:PoolClient){
  if(!(await c.query('SELECT app.owner_inventory_authorize() allowed')).rows[0]?.allowed)throw new ForbiddenException('OWNER_INVENTORY_FORBIDDEN');
 }
 async list(actor:RequestActorContext){
  this.enabled();
  return this.db.withActor(actor,async c=>{
   await c.query("SET LOCAL statement_timeout='5s'");await this.authorize(c);
   const rows=(await c.query(`SELECT p.id,p.name,p.city,p.status,p.timezone,
    (SELECT count(*)::int FROM units u WHERE u.property_id=p.id) AS "unitCount",
    (SELECT jsonb_agg(jsonb_build_object('id',r.id,'currency',r.currency,'nightlyMinor',r.base_nightly_minor::text,'active',r.active) ORDER BY r.id)
      FROM (SELECT id,currency,base_nightly_minor,active FROM rate_plans WHERE property_id=p.id ORDER BY id LIMIT 20) r) AS rates
    FROM properties p WHERE p.organization_id=$1 ORDER BY p.created_at DESC,p.id DESC LIMIT 101`,[actor.organizationId])).rows;
   return {properties:rows.slice(0,100),truncated:rows.length>100,draftOnly:true};
  });
 }
 async create(actor:RequestActorContext,raw:unknown,key:string){
  this.enabled();
  if(typeof key!=='string'||! /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(key))throw new BadRequestException('IDEMPOTENCY_KEY_REQUIRED');
  const input=inventoryDraft(raw),hash=createHash('sha256').update(JSON.stringify(input)).digest('hex');
  const eventKey='owner-inventory:'+actor.organizationId+':'+actor.membershipId+':'+key.toLowerCase();
  return this.db.withActor(actor,async c=>{
   await c.query("SET LOCAL statement_timeout='10s'");await this.authorize(c);
   await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[eventKey]);
   const prior=(await c.query("SELECT payload FROM outbox_events WHERE organization_id=$1 AND idempotency_key=$2 AND event_type='owner.inventory_drafted'",[actor.organizationId,eventKey])).rows[0]?.payload;
   if(prior){if(prior.inputHash!==hash)throw new ConflictException('IDEMPOTENCY_CONFLICT');return {...prior.result,idempotentReplay:true};}
   const propertyId=randomUUID(),unitTypeId=randomUUID(),ratePlanId=randomUUID(),policyId=randomUUID();
   await c.query(`INSERT INTO properties(id,organization_id,name,country_code,city,timezone,address,status)
    VALUES($1,$2,$3,'UZ',$4,'Asia/Tashkent',$5,'draft')`,[propertyId,actor.organizationId,{ru:input.name},input.city,{line1:input.address}]);
   await c.query('INSERT INTO unit_types(id,property_id,name,max_guests) VALUES($1,$2,$3,$4)',[unitTypeId,propertyId,{ru:input.unitTypeName},input.maxGuests]);
   const units=(await c.query(`INSERT INTO units(property_id,unit_type_id,code,status)
    SELECT $1,$2,code,'draft' FROM unnest($3::text[]) code RETURNING id,code`,[propertyId,unitTypeId,input.unitCodes])).rows;
   await c.query(`INSERT INTO cancellation_policy_templates(id,organization_id,code,name,rules,active)
    VALUES($1,$2,$3,$4,$5,false)`,[policyId,actor.organizationId,'DRAFT_'+propertyId,{ru:'Условия отмены'},
     {version:1,rules:[{minHoursBeforeCheckIn:input.freeCancellationHours,refundBps:10000},{minHoursBeforeCheckIn:0,refundBps:0}],nonRefundableLineCodes:[]}]);
   await c.query(`INSERT INTO rate_plans(id,property_id,unit_type_id,name,currency,base_nightly_minor,cancellation_policy_id,active)
    VALUES($1,$2,$3,$4,'UZS',$5,$6,false)`,[ratePlanId,propertyId,unitTypeId,{ru:'Базовый тариф'},input.nightlyMinor,policyId]);
   const result={propertyId,unitTypeId,ratePlanId,policyId,units,status:'draft',currency:'UZS',nightlyMinor:input.nightlyMinor,idempotentReplay:false};
   await c.query(`INSERT INTO audit_log(organization_id,actor_user_id,actor_membership_id,request_id,action,entity_type,entity_id,after_state)
    VALUES($1,$2,$3,$4,'owner.inventory_drafted','property',$5,$6)`,[actor.organizationId,actor.userId,actor.membershipId,actor.requestId,propertyId,{...result,input}]);
   await c.query(`INSERT INTO outbox_events(organization_id,aggregate_type,aggregate_id,event_type,idempotency_key,payload)
    VALUES($1,'property',$2,'owner.inventory_drafted',$3,$4)`,[actor.organizationId,propertyId,eventKey,{inputHash:hash,result}]);
   return result;
  });
 }
}
