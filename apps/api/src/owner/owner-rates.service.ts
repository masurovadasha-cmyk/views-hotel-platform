import {BadRequestException,ConflictException,Injectable,NotFoundException} from '@nestjs/common';
import {DatabaseService} from '../database/database.service';
import type {RequestActorContext} from '../identity/actor-context';
import {calendarId} from './owner-calendar.input';
import {ownerOperatingProperty} from './owner-operating-property';
import {ratesEdit,ratesWindow} from './owner-rates.input';
import {readOwnerRate} from './owner-rates.store';
import {inventoryHash} from './owner-inventory.store';
@Injectable()
export class OwnerRatesService{
 constructor(private readonly db:DatabaseService){}
 private enabled(){if(process.env.NODE_ENV!=='test'||process.env.VIEWS_LOCAL_REHEARSAL!=='true'||process.env.VIEWS_OWNER_RATES_ENABLED!=='true')throw new NotFoundException('OWNER_RATES_DISABLED');}
 async list(actor:RequestActorContext,propertyId:string){
  this.enabled();const id=calendarId(propertyId);return this.db.withActor(actor,async c=>{
   await c.query("SET LOCAL statement_timeout='5s'");await ownerOperatingProperty(c,actor,id);
   const rates=(await c.query(`SELECT r.id,r.name,r.currency,r.base_nightly_minor::text AS "baseNightlyMinor",t.name AS "unitTypeName" FROM rate_plans r JOIN unit_types t ON t.id=r.unit_type_id AND t.property_id=r.property_id WHERE r.property_id=$1 AND r.active AND r.currency='UZS' ORDER BY r.id LIMIT 101`,[id])).rows;
   return {rates:rates.slice(0,100),truncated:rates.length>100};
  });
 }
 async detail(actor:RequestActorContext,propertyId:string,rateId:string,from:unknown,to:unknown){
  this.enabled();const id=calendarId(propertyId),rate=calendarId(rateId),window=ratesWindow(from,to);
  return this.db.withActor(actor,async c=>{
   await c.query("SET LOCAL statement_timeout='5s'");await ownerOperatingProperty(c,actor,id);
   const state=await readOwnerRate(c,id,rate,window.from,window.to);
   return {ratePlanId:rate,...window,revision:state.revision,baseNightlyMinor:state.rate.base_nightly_minor,days:state.days,weekdays:state.weekdays};
  });
 }
 async update(actor:RequestActorContext,propertyId:string,rateId:string,raw:unknown,key:string){
  this.enabled();const id=calendarId(propertyId),rate=calendarId(rateId),input=ratesEdit(raw);
  if(typeof key!=='string'||! /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(key))throw new BadRequestException('IDEMPOTENCY_KEY_REQUIRED');
  const eventKey='owner-rates:'+actor.organizationId+':'+actor.membershipId+':'+key.toLowerCase(),hash=inventoryHash({propertyId:id,rateId:rate,input});
  return this.db.withActor(actor,async c=>{
   await c.query("SET LOCAL statement_timeout='10s'");await ownerOperatingProperty(c,actor,id);
   await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[eventKey]);
   const prior=(await c.query("SELECT payload FROM outbox_events WHERE organization_id=$1 AND idempotency_key=$2 AND event_type='owner.rates_updated'",[actor.organizationId,eventKey])).rows[0]?.payload;
   if(prior){if(prior.inputHash!==hash)throw new ConflictException('IDEMPOTENCY_CONFLICT');return {...prior.result,idempotentReplay:true};}
   const before=await readOwnerRate(c,id,rate,input.from,input.to,true);
   if(before.revision!==input.revision)throw new ConflictException('RATE_REVISION_CONFLICT');
   await c.query('UPDATE rate_plans SET base_nightly_minor=$2 WHERE id=$1',[rate,input.baseNightlyMinor]);
   await c.query('DELETE FROM rate_day_overrides WHERE rate_plan_id=$1 AND stay_date>=$2::date AND stay_date<$3::date AND NOT(stay_date=ANY($4::date[]))',[rate,input.from,input.to,input.days.map(d=>d.stayDate)]);
   for(const d of input.days)await c.query(`INSERT INTO rate_day_overrides(rate_plan_id,stay_date,nightly_minor,min_stay,closed,closed_to_arrival,closed_to_departure) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(rate_plan_id,stay_date) DO UPDATE SET nightly_minor=EXCLUDED.nightly_minor,min_stay=EXCLUDED.min_stay,closed=EXCLUDED.closed,closed_to_arrival=EXCLUDED.closed_to_arrival,closed_to_departure=EXCLUDED.closed_to_departure`,[rate,d.stayDate,d.nightlyMinor,d.minStay,d.closed,d.closedToArrival,d.closedToDeparture]);
   await c.query('DELETE FROM rate_weekday_rules WHERE rate_plan_id=$1 AND NOT(iso_weekday=ANY($2::int[]))',[rate,input.weekdays.map(d=>d.isoWeekday)]);
   for(const d of input.weekdays)await c.query(`INSERT INTO rate_weekday_rules(rate_plan_id,iso_weekday,nightly_minor,price_delta_bps,min_stay,closed,closed_to_arrival,closed_to_departure) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(rate_plan_id,iso_weekday) DO UPDATE SET nightly_minor=EXCLUDED.nightly_minor,price_delta_bps=EXCLUDED.price_delta_bps,min_stay=EXCLUDED.min_stay,closed=EXCLUDED.closed,closed_to_arrival=EXCLUDED.closed_to_arrival,closed_to_departure=EXCLUDED.closed_to_departure`,[rate,d.isoWeekday,d.nightlyMinor,d.priceDeltaBps,d.minStay,d.closed,d.closedToArrival,d.closedToDeparture]);
   const after=await readOwnerRate(c,id,rate,input.from,input.to,true),result={propertyId:id,ratePlanId:rate,revision:after.revision,idempotentReplay:false};
   await c.query(`INSERT INTO audit_log(organization_id,actor_user_id,actor_membership_id,request_id,action,entity_type,entity_id,before_state,after_state) VALUES($1,$2,$3,$4,'owner.rates_updated','rate_plan',$5,$6,$7)`,[actor.organizationId,actor.userId,actor.membershipId,actor.requestId,rate,{baseNightlyMinor:before.rate.base_nightly_minor,days:before.days,weekdays:before.weekdays,from:input.from,to:input.to},{baseNightlyMinor:input.baseNightlyMinor,days:after.days,weekdays:after.weekdays,from:input.from,to:input.to}]);
   await c.query(`INSERT INTO outbox_events(organization_id,aggregate_type,aggregate_id,event_type,idempotency_key,payload) VALUES($1,'rate_plan',$2,'owner.rates_updated',$3,$4)`,[actor.organizationId,rate,eventKey,{inputHash:hash,result}]);return result;
  });
 }
}
