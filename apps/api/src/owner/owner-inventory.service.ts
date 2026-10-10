import {ConflictException,ForbiddenException,Injectable,NotFoundException,BadRequestException} from '@nestjs/common';
import {createHash,randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import {DatabaseService} from '../database/database.service';
import type {RequestActorContext} from '../identity/actor-context';
import {inventoryEdit,inventoryId} from './owner-inventory.edit';
import {readInventory,inventoryHash,cancellationRules} from './owner-inventory.store';
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
 async detail(actor:RequestActorContext,propertyId:string){
  this.enabled();const id=inventoryId(propertyId);
  return this.db.withActor(actor,async c=>{
   await c.query("SET LOCAL statement_timeout='5s'");await this.authorize(c);
   return {propertyId:id,status:'draft',...(await readInventory(c,actor.organizationId,id)).draft};
  });
 }
 async update(actor:RequestActorContext,propertyId:string,raw:unknown,key:string){
  this.enabled();const id=inventoryId(propertyId),input=inventoryEdit(raw);
  if(typeof key!=='string'||! /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(key))throw new BadRequestException('IDEMPOTENCY_KEY_REQUIRED');
  const hash=inventoryHash({propertyId:id,input}),eventKey='owner-inventory-edit:'+actor.organizationId+':'+actor.membershipId+':'+key.toLowerCase();
  return this.db.withActor(actor,async c=>{
   await c.query("SET LOCAL statement_timeout='10s'");await this.authorize(c);
   await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[eventKey]);
   const prior=(await c.query("SELECT payload FROM outbox_events WHERE organization_id=$1 AND idempotency_key=$2 AND event_type='owner.inventory_updated'",[actor.organizationId,eventKey])).rows[0]?.payload;
   if(prior){if(prior.inputHash!==hash)throw new ConflictException('IDEMPOTENCY_CONFLICT');return {...prior.result,idempotentReplay:true};}
   const before=await readInventory(c,actor.organizationId,id,true);
   if(before.draft.revision!==input.revision)throw new ConflictException('INVENTORY_REVISION_CONFLICT');
   const typeIds=new Set(before.types.map(t=>t.id)),unitIds=new Set(before.units.map(u=>u.id));
   if(input.categories.some(t=>(t.id&&!typeIds.has(t.id))||t.units.some(u=>u.id&&!unitIds.has(u.id))))throw new BadRequestException('INVALID_INVENTORY_DRAFT');
   const retained=input.categories.flatMap(t=>t.units.flatMap(u=>u.id?[u.id]:[]));
   await c.query('DELETE FROM units WHERE property_id=$1 AND NOT(id=ANY($2::uuid[]))',[id,retained]);
   // Release unique codes transactionally so two retained rooms can swap codes.
   for(const unit of before.units.filter(u=>retained.includes(u.id)))await c.query("UPDATE units SET code='draft_edit_'||id::text WHERE id=$1",[unit.id]);
   const keptTypes:string[]=[];
   for(const category of input.categories){
    const typeId=category.id||randomUUID();keptTypes.push(typeId);
    if(category.id)await c.query("UPDATE unit_types SET name=name||$2::jsonb,max_guests=$3 WHERE id=$1",[typeId,{ru:category.name},category.maxGuests]);
    else await c.query('INSERT INTO unit_types(id,property_id,name,max_guests) VALUES($1,$2,$3,$4)',[typeId,id,{ru:category.name},category.maxGuests]);
    const rate=before.rates.find(r=>r.unit_type_id===typeId),old=before.draft.categories.find(t=>t.id===typeId);
    let policyId=rate?.cancellation_policy_id;
    // Never mutate a policy possibly referenced by an older snapshot or another rate.
    if(!policyId||old?.freeCancellationHours!==category.freeCancellationHours){
     policyId=randomUUID();await c.query(`INSERT INTO cancellation_policy_templates(id,organization_id,code,name,rules,active)
      VALUES($1,$2,$3,$4,$5,false)`,[policyId,actor.organizationId,'DRAFT_'+policyId,{ru:'Условия отмены'},cancellationRules(category.freeCancellationHours)]);
    }
    if(rate)await c.query('UPDATE rate_plans SET base_nightly_minor=$2,cancellation_policy_id=$3 WHERE id=$1',[rate.id,category.nightlyMinor,policyId]);
    else await c.query(`INSERT INTO rate_plans(id,property_id,unit_type_id,name,currency,base_nightly_minor,cancellation_policy_id,active)
      VALUES($1,$2,$3,$4,'UZS',$5,$6,false)`,[randomUUID(),id,typeId,{ru:'Базовый тариф'},category.nightlyMinor,policyId]);
    for(const unit of category.units){
     if(unit.id)await c.query('UPDATE units SET unit_type_id=$2,code=$3,updated_at=clock_timestamp() WHERE id=$1',[unit.id,typeId,unit.code]);
     else await c.query("INSERT INTO units(property_id,unit_type_id,code,status) VALUES($1,$2,$3,'draft')",[id,typeId,unit.code]);
    }
   }
   await c.query('DELETE FROM rate_plans WHERE property_id=$1 AND NOT(unit_type_id=ANY($2::uuid[]))',[id,keptTypes]);
   await c.query('DELETE FROM unit_types WHERE property_id=$1 AND NOT(id=ANY($2::uuid[]))',[id,keptTypes]);
   await c.query("UPDATE properties SET name=name||$2::jsonb,city=$3,address=address||$4::jsonb,updated_at=clock_timestamp() WHERE id=$1",[id,{ru:input.name},input.city,{line1:input.address}]);
   const after=(await readInventory(c,actor.organizationId,id,true)).draft;
   const result={propertyId:id,status:'draft',revision:after.revision,idempotentReplay:false};
   await c.query(`INSERT INTO audit_log(organization_id,actor_user_id,actor_membership_id,request_id,action,entity_type,entity_id,before_state,after_state)
    VALUES($1,$2,$3,$4,'owner.inventory_updated','property',$5,$6,$7)`,[actor.organizationId,actor.userId,actor.membershipId,actor.requestId,id,before.draft,after]);
   await c.query(`INSERT INTO outbox_events(organization_id,aggregate_type,aggregate_id,event_type,idempotency_key,payload)
    VALUES($1,'property',$2,'owner.inventory_updated',$3,$4)`,[actor.organizationId,id,eventKey,{inputHash:hash,result}]);
   return result;
  }).catch(error=>{
   if(error?.code==='23503'||error?.code==='23505')throw new ConflictException('INVENTORY_NOT_EDITABLE');
   throw error;
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
