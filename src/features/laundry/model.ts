export type LaundryClaimState={status:'open'|'answered'|'resolved';tag:string;kind:'missing'|'damaged'|'quality';history:{action:'report_claim'|'answer_claim'|'resolve_claim';at:string;note:string;tag?:string;kind?:string}[]};
export type LaundryItem={tag:string;description:string;priceMinor:string};
export type LaundryIntake={claim?:LaundryClaimState|null;intakeId:string;stage:string;revision:number;name:Record<string,string>;currency:string;declaredCount:number;preferences:string;pickupAt:string;estimateMinor:string;items:LaundryItem[]|null;totalMinor:string|null;returnBy:string|null;unitCode?:string};
const MAX=9223372036854775807n;
/** Major currency input -> exact minor units, never floating point. */
export function priceMinor(value:string):string|null{
 if(!/^\d{1,17}(?:[.,]\d{1,2})?$/.test(value))return null;
 const [whole,fraction='']=value.replace(',','.').split('.');const n=BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0'));
 return n>0n&&n<=MAX?n.toString():null;
}
export function majorPrice(value:string){const n=BigInt(value);return `${n/100n}.${(n%100n).toString().padStart(2,'0')}`;}
export function inventoryValid(items:LaundryItem[]){return items.length>0&&items.length<=50&&new Set(items.map(i=>i.tag)).size===items.length&&items.every(i=>/^[A-Z0-9-]{1,24}$/.test(i.tag)&&i.description.trim().length>0&&i.description.length<=160&&!/[\u0000-\u001f\u007f]/.test(i.description)&&/^[1-9]\d{0,18}$/.test(i.priceMinor))&&items.reduce((s,i)=>s+BigInt(i.priceMinor),0n)<=MAX;}
