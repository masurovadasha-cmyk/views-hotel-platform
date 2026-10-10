import {BadRequestException} from '@nestjs/common';
export function invalid():never{throw new BadRequestException('SERVICE_INPUT_INVALID');}
export function uuid(v:unknown):string{if(typeof v!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v))return invalid();return v.toLowerCase();}
export function object(v:unknown,keys:string[]){if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).length!==keys.length||keys.some(k=>!Object.hasOwn(v,k)))return invalid();return v as Record<string,unknown>;}
export function revision(v:unknown):number{if(!Number.isSafeInteger(v)||(v as number)<1||(v as number)>2147483647)return invalid();return v as number;}
export function note(v:unknown):string{if(typeof v!=='string'||!v.trim()||v.trim().length>500||/[\u0000-\u001f]/.test(v))return invalid();return v.trim();}
export function requestedTime(v:unknown):string{
 if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v)||!Number.isFinite(Date.parse(v))||new Date(v).toISOString()!==v)return invalid();
 return v;
}
export function guestChangeInput(raw:unknown){
 if(!raw||typeof raw!=='object'||!('action' in raw))return invalid();
 if(raw.action==='cancel'){const b=object(raw,['action','expectedRevision']);return {action:'cancel',expectedRevision:revision(b.expectedRevision)};}
 if(raw.action==='reschedule'){const b=object(raw,['action','expectedRevision','requestedFor']);return {action:'reschedule',expectedRevision:revision(b.expectedRevision),requestedFor:requestedTime(b.requestedFor)};}
 return invalid();
}
export function requestInput(raw:unknown){
 const b=object(raw,['reservationId','serviceId','expectedRevision','expectedPriceMinor','requestedFor']);
 if(typeof b.expectedPriceMinor!=='string'||!/^[1-9]\d{0,18}$/.test(b.expectedPriceMinor)||BigInt(b.expectedPriceMinor)>9223372036854775807n)return invalid();
 if(typeof b.requestedFor!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(b.requestedFor)||!Number.isFinite(Date.parse(b.requestedFor))||new Date(b.requestedFor).toISOString()!==b.requestedFor)return invalid();
 return {reservationId:uuid(b.reservationId),serviceId:uuid(b.serviceId),expectedRevision:revision(b.expectedRevision),expectedPriceMinor:b.expectedPriceMinor,requestedFor:b.requestedFor};
}
export function actionInput(raw:unknown){
 if(!raw||typeof raw!=='object'||!('action' in raw))return invalid();
 const action=raw.action;
 if(action==='assign'){const b=object(raw,['action','expectedRevision','assigneeId']);return {action,expectedRevision:revision(b.expectedRevision),assigneeId:uuid(b.assigneeId)};}
 if(action==='start'){const b=object(raw,['action','expectedRevision']);return {action,expectedRevision:revision(b.expectedRevision)};}
 if(action==='submit'){const b=object(raw,['action','expectedRevision','checklist','note']),check=object(b.checklist,['linen','bathroom','floor']);if(Object.values(check).some(v=>v!==true))return invalid();return {action,expectedRevision:revision(b.expectedRevision),checklist:{linen:true,bathroom:true,floor:true},note:note(b.note)};}
 if(action==='approve'||action==='reject'||action==='cancel'){const b=object(raw,['action','expectedRevision','note']);return {action,expectedRevision:revision(b.expectedRevision),note:note(b.note)};}
 return invalid();
}
