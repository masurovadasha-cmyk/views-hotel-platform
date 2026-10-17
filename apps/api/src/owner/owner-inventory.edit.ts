import {BadRequestException} from '@nestjs/common';
import {inventoryDraft} from './owner-inventory.input';
export type InventoryCategory={id:string|null;name:string;maxGuests:number;units:{id:string|null;code:string}[];nightlyMinor:string;freeCancellationHours:number};
export type InventoryEdit={revision:string;name:string;city:string;address:string;categories:InventoryCategory[]};
const invalid=():never=>{throw new BadRequestException('INVALID_INVENTORY_DRAFT');};
export function inventoryId(value:unknown):string{
 if(typeof value!=='string'||! /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value))return invalid();
 return value.toLowerCase();
}
function exact(value:unknown,keys:string):Record<string,unknown>{
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join(',')!==keys)return invalid();
 return value as Record<string,unknown>;
}
export function inventoryEdit(value:unknown):InventoryEdit{
 const v=exact(value,'address,categories,city,name,revision');
 if(typeof v.revision!=='string'||! /^[a-f0-9]{64}$/.test(v.revision)||!Array.isArray(v.categories)||!v.categories.length||v.categories.length>20)return invalid();
 const categoryIds=new Set<string>(),unitIds=new Set<string>(),codes=new Set<string>(),names=new Set<string>();
 const categories=v.categories.map(raw=>{
  const c=exact(raw,'freeCancellationHours,id,maxGuests,name,nightlyMinor,units');
  const id=c.id===null?null:inventoryId(c.id);
  if(id&&categoryIds.has(id))return invalid();if(id)categoryIds.add(id);
  if(!Array.isArray(c.units))return invalid();
  const units=c.units.map(rawUnit=>{
   const u=exact(rawUnit,'code,id'),uid=u.id===null?null:inventoryId(u.id);
   if((uid&&unitIds.has(uid))||typeof u.code!=='string'||codes.has(u.code))return invalid();
   if(uid)unitIds.add(uid);codes.add(u.code);return {id:uid,code:u.code};
  }).sort((a,b)=>a.code.localeCompare(b.code,'en'));
  const checked=inventoryDraft({name:v.name,city:v.city,address:v.address,unitTypeName:c.name,maxGuests:c.maxGuests,unitCodes:units.map(u=>u.code),nightlyMinor:c.nightlyMinor,freeCancellationHours:c.freeCancellationHours});
  const normalizedName=checked.unitTypeName.toLocaleLowerCase('en');if(names.has(normalizedName))return invalid();names.add(normalizedName);
  return {id,name:checked.unitTypeName,maxGuests:checked.maxGuests,units,nightlyMinor:checked.nightlyMinor,freeCancellationHours:checked.freeCancellationHours};
 }).sort((a,b)=>(a.id||a.name).localeCompare(b.id||b.name,'en'));
 if(codes.size>100)return invalid();
 return {revision:v.revision,name:v.name as string,city:v.city as string,address:v.address as string,categories};
}
