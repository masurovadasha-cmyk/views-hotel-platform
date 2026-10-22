import {BadRequestException} from '@nestjs/common';
const invalid=():never=>{throw new BadRequestException('INVALID_CALENDAR_INPUT');};
export function calendarId(value:unknown){if(typeof value!=='string'||! /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value))return invalid();return value.toLowerCase();}
export function calendarTime(value:unknown){
 if(typeof value!=='string'||! /^20[0-9]{2}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}\+05:00$/.test(value))return invalid();
 const time=Date.parse(value);if(!Number.isFinite(time)||new Date(time+5*3600000).toISOString().slice(0,16)!==value.slice(0,16))return invalid();return value;
}
export function calendarWindow(from:unknown,to:unknown){
 if(typeof from!=='string'||typeof to!=='string'||!/^20[0-9]{2}-[0-9]{2}-[0-9]{2}$/.test(from)||!/^20[0-9]{2}-[0-9]{2}-[0-9]{2}$/.test(to))return invalid();
 const start=calendarTime(from+'T00:00+05:00'),end=calendarTime(to+'T00:00+05:00'),duration=Date.parse(end)-Date.parse(start);
 if(duration<=0||duration>62*86400000)return invalid();return {start,end};
}
export type CalendarCommand={action:'block';unitId:string;kind:'host_block'|'maintenance';start:string;end:string}|{action:'unblock';periodId:string};
export function calendarCommand(value:unknown):CalendarCommand{
 if(!value||typeof value!=='object'||Array.isArray(value))return invalid();const v=value as Record<string,unknown>,keys=Object.keys(v).sort().join(',');
 if(v.action==='unblock'&&keys==='action,periodId')return {action:'unblock',periodId:calendarId(v.periodId)};
 if(v.action!=='block'||keys!=='action,end,kind,start,unitId'||!['host_block','maintenance'].includes(String(v.kind)))return invalid();
 const start=calendarTime(v.start),end=calendarTime(v.end),duration=Date.parse(end)-Date.parse(start);
 if(duration<=0||duration>366*86400000)return invalid();return {action:'block',unitId:calendarId(v.unitId),kind:v.kind as 'host_block'|'maintenance',start,end};
}
