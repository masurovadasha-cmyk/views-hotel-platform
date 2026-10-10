import {request} from './LocalCoreWorkspace';
import {formatStaffMoney,type StaffLocale} from './staff-locale';
export type FolioProperty={id:string;name:Record<string,string>;timezone:string};
export type FolioSummary={id:string|null;reservationId:string;confirmationCode:string;currency:string;status:'open'|'closed'|'not_opened';balanceMinor:string;entryCount:number};
export type FolioEntry={id:string;kind:string;amountMinor:string;label:Record<string,string>;createdAt:string;reversalOf:string|null;reversed:boolean;sourceType:string;businessDate?:string|null};
export type FolioPage={items:FolioSummary[];nextCursor:string|null;accountingMode:'operational_charges'};
export type FolioDetail={folio:FolioSummary;items:FolioEntry[];nextCursor:string|null;accountingMode:'operational_charges'};
export type AuditTotals=Array<{currency:string;amountMinor:string}>;
export type AuditRun={id:string;reservationCount:number;postedCount:number;zeroAmountCount:number;totals:AuditTotals;createdAt:string};
export type AuditPreview={propertyId:string;businessDate:string;timezone:string;revision:string;run:AuditRun|null;eligibleCount:number;unresolvedCount:number;invalidSnapshotCount:number;scopeChanged:boolean;accountingMode:'operational_charges'};
export type AuditReceipt={runId:string;propertyId:string;businessDate:string;reservationCount:number;postedCount:number;zeroAmountCount:number;totals:AuditTotals;idempotentReplay:boolean;accountingMode:'operational_charges'};
export type EntryReceipt={entryId:string;folioId:string;reservationId:string;idempotentReplay:boolean};
export type ChargeBody={kind:'service'|'minibar'|'fee';amountMinor:string;label:string};
const integer=/^-?\d{1,40}$/;
function money(value:unknown):value is string{return typeof value==='string'&&integer.test(value);}
function fail():never{throw Error('FOLIO_INVALID_RESPONSE');}
function cursor(value:unknown){return value===null||(typeof value==='string'&&/^[A-Za-z0-9_-]{1,400}$/.test(value));}
function summary(value:FolioSummary){if(!value||(value.id!==null&&typeof value.id!=='string')||typeof value.reservationId!=='string'||typeof value.confirmationCode!=='string'||!['open','closed','not_opened'].includes(value.status)||!/^[A-Z]{3}$/.test(value.currency)||!money(value.balanceMinor)||!Number.isSafeInteger(value.entryCount)||value.entryCount<0)fail();return value;}
export function parseFolioPage(value:FolioPage):FolioPage{
 if(!value||value.accountingMode!=='operational_charges'||!Array.isArray(value.items)||value.items.length>50||!cursor(value.nextCursor))fail();value.items.forEach(summary);return value;
}
export function parseFolioDetail(value:FolioDetail,id:string):FolioDetail{
 if(!value||value.accountingMode!=='operational_charges'||!Array.isArray(value.items)||value.items.length>50||!cursor(value.nextCursor))fail();
 if(summary(value.folio).reservationId!==id)fail();
 for(const item of value.items)if(!item||typeof item.id!=='string'||!money(item.amountMinor)||!item.label||typeof item.label!=='object'||Object.values(item.label).some(v=>typeof v!=='string')||!Number.isFinite(Date.parse(item.createdAt))||typeof item.reversed!=='boolean'||typeof item.sourceType!=='string')fail();return value;
}
export function parseAuditPreview(value:AuditPreview,propertyId:string,businessDate:string):AuditPreview{
 if(!value||value.propertyId!==propertyId||value.businessDate!==businessDate||! /^[a-f0-9]{64}$/.test(value.revision)||value.accountingMode!=='operational_charges'||typeof value.timezone!=='string'||!value.timezone||!Number.isSafeInteger(value.eligibleCount)||value.eligibleCount<0||!Number.isSafeInteger(value.unresolvedCount)||value.unresolvedCount<0||!Number.isSafeInteger(value.invalidSnapshotCount)||value.invalidSnapshotCount<0||typeof value.scopeChanged!=='boolean')fail();
 try{new Intl.DateTimeFormat('en',{timeZone:value.timezone});}catch{fail();}if(value.run){if(typeof value.run.id!=='string'||!Number.isFinite(Date.parse(value.run.createdAt))||![value.run.reservationCount,value.run.postedCount,value.run.zeroAmountCount].every(n=>Number.isSafeInteger(n)&&n>=0))fail();validateTotals(value.run.totals);}return value;
}
function validateTotals(totals:AuditTotals){if(!Array.isArray(totals)||totals.some(v=>!/^[A-Z]{3}$/.test(v.currency)||!money(v.amountMinor)||BigInt(v.amountMinor)<0n))fail();}
export function parseAuditReceipt(value:AuditReceipt,propertyId:string,businessDate:string):AuditReceipt{
 if(!value||value.propertyId!==propertyId||value.businessDate!==businessDate||typeof value.runId!=='string'||value.accountingMode!=='operational_charges'||typeof value.idempotentReplay!=='boolean'||![value.reservationCount,value.postedCount,value.zeroAmountCount].every(n=>Number.isSafeInteger(n)&&n>=0))fail();validateTotals(value.totals);return value;
}
export function majorToMinor(value:string):string{
 if(!/^\d{1,17}([.,]\d{1,2})?$/.test(value))throw Error('FOLIO_AMOUNT_INVALID');
 const [whole,fraction='']=value.replace(',','.').split('.'),minor=BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0'));
 if(minor<=0n||minor>9223372036854775807n)throw Error('FOLIO_AMOUNT_INVALID');return minor.toString();
}
export function folioMoney(value:string,currency:string,locale:StaffLocale){
 if(!money(value))return '—';const negative=value.startsWith('-'),absolute=negative?value.slice(1):value;
 return (negative?'−':'')+(['UZS','USD','EUR'].includes(currency)?formatStaffMoney(absolute,locale).replace(/UZS$/,currency):absolute+' '+currency);
}
export const folioApi={
 async properties(csrf:string,next?:string){const b=await request<{items:FolioProperty[];nextCursor:string|null}>('folios/properties'+(next?'?cursor='+encodeURIComponent(next):''),csrf);if(!b||!Array.isArray(b.items)||b.items.length>50||!cursor(b.nextCursor)||b.items.some(p=>!p||typeof p.id!=='string'||!p.name||typeof p.timezone!=='string'||!p.timezone||Object.values(p.name).some(v=>typeof v!=='string')))fail();for(const p of b.items){try{new Intl.DateTimeFormat('en',{timeZone:p.timezone});}catch{fail();}}return b;},
 async list(csrf:string,propertyId:string,next?:string){return parseFolioPage(await request<FolioPage>('folios?'+new URLSearchParams({propertyId,...(next?{cursor:next}:{})}),csrf));},
 async detail(csrf:string,id:string,next?:string){return parseFolioDetail(await request<FolioDetail>('folios/reservations/'+encodeURIComponent(id)+(next?'?cursor='+encodeURIComponent(next):''),csrf),id);},
 async entry(csrf:string,id:string,action:'charges'|'reversals',body:ChargeBody|{entryId:string;reason:string},key:string){const result=await request<EntryReceipt>('folios/reservations/'+encodeURIComponent(id)+'/'+action,csrf,body,key);if(!result||result.reservationId!==id||typeof result.entryId!=='string'||typeof result.folioId!=='string'||typeof result.idempotentReplay!=='boolean')fail();return result;},
 async audit(csrf:string,propertyId:string,businessDate:string){return parseAuditPreview(await request<AuditPreview>('night-audit?'+new URLSearchParams({propertyId,businessDate}),csrf),propertyId,businessDate);},
 async runAudit(csrf:string,body:{propertyId:string;businessDate:string;expectedRevision:string},key:string){return parseAuditReceipt(await request<AuditReceipt>('night-audit',csrf,body,key),body.propertyId,body.businessDate);}
};
