import {BadRequestException} from '@nestjs/common';
export type InventoryDraft={name:string;city:string;address:string;unitTypeName:string;maxGuests:number;unitCodes:string[];nightlyMinor:string;freeCancellationHours:number};
const invalid=()=>{throw new BadRequestException('INVALID_INVENTORY_DRAFT');};
export function inventoryDraft(value:unknown):InventoryDraft{
 if(!value||typeof value!=='object'||Array.isArray(value))return invalid();
 const v=value as InventoryDraft;
 if(Object.keys(v).sort().join(',')!=='address,city,freeCancellationHours,maxGuests,name,nightlyMinor,unitCodes,unitTypeName')return invalid();
 for(const [text,max] of [[v.name,120],[v.city,100],[v.address,300],[v.unitTypeName,100]] as const)
  if(typeof text!=='string'||text!==text.trim()||!text.length||text.length>max||/[\p{Cc}\p{Cf}<>]/u.test(text))return invalid();
 if(!Number.isInteger(v.maxGuests)||v.maxGuests<1||v.maxGuests>20||!Number.isInteger(v.freeCancellationHours)||v.freeCancellationHours<1||v.freeCancellationHours>720)return invalid();
 if(typeof v.nightlyMinor!=='string'||! /^(0|[1-9][0-9]{0,14})$/.test(v.nightlyMinor))return invalid();
 if(!Array.isArray(v.unitCodes)||v.unitCodes.length<1||v.unitCodes.length>100||v.unitCodes.some(c=>typeof c!=='string'||! /^[A-Z0-9][A-Z0-9_-]{0,19}$/.test(c))||new Set(v.unitCodes).size!==v.unitCodes.length)return invalid();
 // Canonical order makes equivalent retries stable. Money never passes through Number.
 return {name:v.name,city:v.city,address:v.address,unitTypeName:v.unitTypeName,maxGuests:v.maxGuests,unitCodes:[...v.unitCodes].sort(),nightlyMinor:v.nightlyMinor,freeCancellationHours:v.freeCancellationHours};
}
