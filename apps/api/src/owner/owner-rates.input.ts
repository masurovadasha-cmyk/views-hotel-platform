import {BadRequestException} from '@nestjs/common';
import {calendarWindow} from './owner-calendar.input';
export type RateRestriction={nightlyMinor:string|null;minStay:number|null;closed:boolean;closedToArrival:boolean;closedToDeparture:boolean};
export type DayRate=RateRestriction&{stayDate:string};
export type WeekRate=RateRestriction&{isoWeekday:number;priceDeltaBps:number|null};
export type RatesEdit={revision:string;from:string;to:string;baseNightlyMinor:string;days:DayRate[];weekdays:WeekRate[]};
const invalid=():never=>{throw new BadRequestException('INVALID_RATE_EDIT');};
function object(raw:unknown,keys:string){if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).sort().join(',')!==keys)return invalid();return raw as Record<string,unknown>;}
export function rateMoney(raw:unknown):string{if(typeof raw!=='string'||!/^(0|[1-9][0-9]{0,14})$/.test(raw))return invalid();return raw;}
function restriction(v:Record<string,unknown>):RateRestriction{
 const nightlyMinor=v.nightlyMinor===null?null:rateMoney(v.nightlyMinor);
 if(v.minStay!==null&&(!Number.isInteger(v.minStay)||Number(v.minStay)<1||Number(v.minStay)>730))return invalid();
 if(['closed','closedToArrival','closedToDeparture'].some(k=>typeof v[k]!=='boolean'))return invalid();
 return {nightlyMinor,minStay:v.minStay as number|null,closed:v.closed as boolean,closedToArrival:v.closedToArrival as boolean,closedToDeparture:v.closedToDeparture as boolean};
}
export function ratesWindow(from:unknown,to:unknown){try{calendarWindow(from,to);}catch{return invalid();}return {from:from as string,to:to as string};}
export function ratesEdit(raw:unknown):RatesEdit{
 const v=object(raw,'baseNightlyMinor,days,from,revision,to,weekdays'),window=ratesWindow(v.from,v.to);
 if(typeof v.revision!=='string'||!/^[a-f0-9]{64}$/.test(v.revision)||!Array.isArray(v.days)||v.days.length>62||!Array.isArray(v.weekdays)||v.weekdays.length>7)return invalid();
 const dates=new Set<string>(),week=new Set<number>();
 const days=v.days.map(raw=>{const d=object(raw,'closed,closedToArrival,closedToDeparture,minStay,nightlyMinor,stayDate');
  if(typeof d.stayDate!=='string'||d.stayDate<window.from||d.stayDate>=window.to||dates.has(d.stayDate))return invalid();
  try{calendarWindow(d.stayDate,new Date(Date.parse(d.stayDate+'T00:00Z')+86400000).toISOString().slice(0,10));}catch{return invalid();}
  dates.add(d.stayDate);return {stayDate:d.stayDate,...restriction(d)};
 }).sort((a,b)=>a.stayDate.localeCompare(b.stayDate));
 const weekdays=v.weekdays.map(raw=>{const d=object(raw,'closed,closedToArrival,closedToDeparture,isoWeekday,minStay,nightlyMinor,priceDeltaBps');
  if(!Number.isInteger(d.isoWeekday)||Number(d.isoWeekday)<1||Number(d.isoWeekday)>7||week.has(d.isoWeekday as number))return invalid();
  const rule=restriction(d);if(d.priceDeltaBps!==null&&(!Number.isInteger(d.priceDeltaBps)||Number(d.priceDeltaBps)<-10000||Number(d.priceDeltaBps)>100000||rule.nightlyMinor!==null))return invalid();
  week.add(d.isoWeekday as number);return {isoWeekday:d.isoWeekday as number,priceDeltaBps:d.priceDeltaBps as number|null,...rule};
 }).sort((a,b)=>a.isoWeekday-b.isoWeekday);
 return {revision:v.revision,...window,baseNightlyMinor:rateMoney(v.baseNightlyMinor),days,weekdays};
}
