import {ConflictException,NotFoundException} from '@nestjs/common';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import type {PoolClient} from 'pg';
import {inventoryEdit,type InventoryEdit} from './owner-inventory.edit';
export const inventoryHash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const cancellationRules=(hours:number)=>({version:1,rules:[{minHoursBeforeCheckIn:hours,refundBps:10000},{minHoursBeforeCheckIn:0,refundBps:0}],nonRefundableLineCodes:[]});
const blocked=():never=>{throw new ConflictException('INVENTORY_NOT_EDITABLE');};
// Lock in one order. Property FOR UPDATE also excludes concurrent child inserts
// through their foreign keys. Every mutation below is a single draft transaction.
export async function readInventory(c:PoolClient,organizationId:string,id:string,write=false){
 const lock=write?'UPDATE':'SHARE';
 const property=(await c.query(`SELECT * FROM properties WHERE organization_id=$1 AND id=$2 FOR ${lock}`,[organizationId,id])).rows[0];
 if(!property)throw new NotFoundException('INVENTORY_NOT_FOUND');
 if(property.status!=='draft'||property.country_code!=='UZ'||property.timezone!=='Asia/Tashkent')return blocked();
 if(!(await c.query("SELECT 1 FROM outbox_events WHERE organization_id=$1 AND aggregate_id=$2 AND event_type='owner.inventory_drafted' LIMIT 1",[organizationId,id])).rowCount)return blocked();
 const types=(await c.query(`SELECT * FROM unit_types WHERE property_id=$1 ORDER BY id LIMIT 21 FOR ${lock}`,[id])).rows;
 const units=(await c.query(`SELECT * FROM units WHERE property_id=$1 ORDER BY id LIMIT 101 FOR ${lock}`,[id])).rows;
 const rates=(await c.query(`SELECT * FROM rate_plans WHERE property_id=$1 ORDER BY id LIMIT 21 FOR ${lock}`,[id])).rows;
 const policies=(await c.query(`SELECT * FROM cancellation_policy_templates WHERE id=ANY($1::uuid[]) ORDER BY id FOR ${lock}`,[rates.map(r=>r.cancellation_policy_id)])).rows;
 if(!types.length||types.length>20||!units.length||units.length>100||rates.length!==types.length||policies.length!==types.length||units.some(u=>u.status!=='draft'||!types.some(t=>t.id===u.unit_type_id)))return blocked();
 // Operational data or a shared policy is never rewritten through this editor.
 if((await c.query(`SELECT 1 FROM reservations WHERE property_id=$1 UNION ALL SELECT 1 FROM booking_quotes WHERE property_id=$1 UNION ALL SELECT 1 FROM inventory_periods WHERE property_id=$1 LIMIT 1`,[id])).rowCount)return blocked();
 if((await c.query('SELECT 1 FROM rate_plans WHERE property_id<>$1 AND cancellation_policy_id=ANY($2::uuid[]) LIMIT 1',[id,policies.map(p=>p.id)])).rowCount)return blocked();
 // Existing seasonal/weekday pricing is outside this draft editor. In particular,
 // deleting a category must never cascade into such independently configured rules.
 if((await c.query(`SELECT 1 FROM rate_day_overrides WHERE rate_plan_id=ANY($1::uuid[])
  UNION ALL SELECT 1 FROM rate_weekday_rules WHERE rate_plan_id=ANY($1::uuid[])
  UNION ALL SELECT 1 FROM rate_adjustments WHERE rate_plan_id=ANY($1::uuid[]) LIMIT 1`,[rates.map(r=>r.id)])).rowCount)return blocked();
 const categories=types.map(t=>{
  const matching=rates.filter(r=>r.unit_type_id===t.id),members=units.filter(u=>u.unit_type_id===t.id);
  if(matching.length!==1||!members.length)return blocked();const rate=matching[0],policy=policies.find(p=>p.id===rate.cancellation_policy_id);
  const hours=policy?.rules?.rules?.[0]?.minHoursBeforeCheckIn;
  if(rate.active||rate.currency!=='UZS'||!policy||policy.active||policy.organization_id!==organizationId||!Number.isInteger(hours)||hours<1||hours>720||!isDeepStrictEqual(policy.rules,cancellationRules(hours)))return blocked();
  return {id:t.id,name:t.name.ru,maxGuests:t.max_guests,units:members.map(u=>({id:u.id,code:u.code})),nightlyMinor:rate.base_nightly_minor,freeCancellationHours:hours};
 });
 const revision=inventoryHash({property,types,units,rates,policies});
 const draft:InventoryEdit={revision,name:property.name.ru,city:property.city,address:property.address.line1,categories};
 try{inventoryEdit(draft);}catch{return blocked();}
 return {property,types,units,rates,policies,draft};
}
