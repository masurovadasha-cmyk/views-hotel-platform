import {ConflictException,NotFoundException} from '@nestjs/common';
import type {PoolClient} from 'pg';
import {inventoryHash} from './owner-inventory.store';
import type {DayRate,WeekRate} from './owner-rates.input';
export async function readOwnerRate(c:PoolClient,propertyId:string,rateId:string,from:string,to:string,write=false){
 const lock=write?'UPDATE':'SHARE';
 const rate=(await c.query(`SELECT * FROM rate_plans WHERE id=$1 AND property_id=$2 FOR ${lock}`,[rateId,propertyId])).rows[0];
 if(!rate)throw new NotFoundException('RATE_NOT_FOUND');if(!rate.active||rate.currency!=='UZS')throw new ConflictException('RATE_NOT_EDITABLE');
 const days=(await c.query<DayRate&{id:string}>(`SELECT id,stay_date::text AS "stayDate",nightly_minor::text AS "nightlyMinor",min_stay AS "minStay",closed,closed_to_arrival AS "closedToArrival",closed_to_departure AS "closedToDeparture" FROM rate_day_overrides WHERE rate_plan_id=$1 AND stay_date>=$2::date AND stay_date<$3::date ORDER BY stay_date FOR ${lock}`,[rateId,from,to])).rows;
 const weekdays=(await c.query<WeekRate&{id:string}>(`SELECT id,iso_weekday AS "isoWeekday",nightly_minor::text AS "nightlyMinor",price_delta_bps AS "priceDeltaBps",min_stay AS "minStay",closed,closed_to_arrival AS "closedToArrival",closed_to_departure AS "closedToDeparture" FROM rate_weekday_rules WHERE rate_plan_id=$1 ORDER BY iso_weekday FOR ${lock}`,[rateId])).rows;
 return {rate,revision:inventoryHash({rate,from,to,days,weekdays}),days:days.map(({id,...d})=>d),weekdays:weekdays.map(({id,...w})=>w)};
}
