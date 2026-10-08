import {ConflictException} from '@nestjs/common';
import {day} from './folio.input';
export type FrozenLine={id:string;lineType:string;code:string;amountMinor:string;currency:string;metadata:Record<string,unknown>};
export type NightSource={reservationId:string;currency:string;totalMinor:string;checkInDate:string;checkOutDate:string;timezone:string;lines:FrozenLine[]};
export function nightlyAllocation(source:NightSource){try{
 const nights=source.lines.filter(l=>l.lineType==='night').sort((a,b)=>String(a.metadata.stayDate).localeCompare(String(b.metadata.stayDate))),discounts=source.lines.filter(l=>l.lineType==='discount'),charges=source.lines.filter(l=>l.lineType==='charge');
 if(!nights.length||nights.length+discounts.length+charges.length!==source.lines.length||source.lines.some(l=>l.currency!==source.currency)||source.lines.reduce((n,l)=>n+BigInt(l.amountMinor),0n)!==BigInt(source.totalMinor)||discounts.some(l=>BigInt(l.amountMinor)>0n)||charges.some(l=>BigInt(l.amountMinor)<0n))throw Error();
 const expected:string[]=[];for(let d=day(source.checkInDate);d<source.checkOutDate;d=new Date(Date.parse(d+'T00:00Z')+86400000).toISOString().slice(0,10)){if(expected.length>=3660)throw Error();expected.push(d);}
 if(nights.length!==expected.length||nights.some((n,i)=>n.metadata.stayDate!==expected[i]||n.code!=='night:'+expected[i]||BigInt(n.amountMinor)<0n))throw Error();
 const gross=nights.reduce((n,l)=>n+BigInt(l.amountMinor),0n),discount=-discounts.reduce((n,l)=>n+BigInt(l.amountMinor),0n);
 if(discount>gross)throw Error();const allocations=nights.map(n=>({sourceLineId:n.id,businessDate:n.metadata.stayDate as string,amountMinor:(gross?BigInt(n.amountMinor)*(gross-discount)/gross:0n).toString()}));
 let remainder=gross-discount-allocations.reduce((n,a)=>n+BigInt(a.amountMinor),0n);
 for(const [i,a] of allocations.entries()){if(remainder>0n&&BigInt(a.amountMinor)<BigInt(nights[i].amountMinor)){a.amountMinor=(BigInt(a.amountMinor)+1n).toString();remainder--;}}
 if(remainder!==0n)throw Error();return allocations;
 }catch{throw new ConflictException('NIGHT_AUDIT_RECONCILIATION_REQUIRED');}}
