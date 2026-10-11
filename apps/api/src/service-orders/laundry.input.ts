import {invalid,object,uuid,revision,requestedTime} from './service-order.input';
const MAX=9223372036854775807n;
function text(v:unknown,max:number,empty=false){if(typeof v!=='string'||v.length>max||(!empty&&!v.trim())||/[\u0000-\u001f\u007f]/.test(v))return invalid();return v.trim();}
function money(v:unknown){if(typeof v!=='string'||!/^[1-9]\d{0,18}$/.test(v)||BigInt(v)>MAX)return invalid();return v;}
export function laundryRequest(raw:unknown){
 const b=object(raw,['reservationId','serviceId','expectedRevision','declaredCount','preferences','pickupAt']);
 if(!Number.isInteger(b.declaredCount)||(b.declaredCount as number)<1||(b.declaredCount as number)>50)return invalid();
 return {reservationId:uuid(b.reservationId),serviceId:uuid(b.serviceId),expectedRevision:revision(b.expectedRevision),declaredCount:b.declaredCount as number,preferences:text(b.preferences,500,true),pickupAt:requestedTime(b.pickupAt)};
}
export function laundryAction(raw:unknown,staff:boolean){
 if(!raw||typeof raw!=='object'||!('action' in raw))return invalid();
 const action=raw.action;
 if(staff&&action==='quote'){
  const b=object(raw,['action','expectedRevision','items','returnBy']);if(!Array.isArray(b.items)||b.items.length<1||b.items.length>50)return invalid();
  const items=b.items.map(raw=>{const i=object(raw,['tag','description','priceMinor']);if(typeof i.tag!=='string'||!/^[A-Z0-9-]{1,24}$/.test(i.tag))return invalid();return {tag:i.tag,description:text(i.description,160),priceMinor:money(i.priceMinor)};});
  if(new Set(items.map(i=>i.tag)).size!==items.length||items.reduce((sum,i)=>sum+BigInt(i.priceMinor),0n)>MAX)return invalid();
  return {action,expectedRevision:revision(b.expectedRevision),items,returnBy:requestedTime(b.returnBy)};
 }
 if(!staff&&action==='accept'){const b=object(raw,['action','expectedRevision','expectedTotalMinor']);return {action,expectedRevision:revision(b.expectedRevision),expectedTotalMinor:money(b.expectedTotalMinor)};}
 if(typeof action!=='string'||!(staff?['receive','wash','ready','deliver','return_unprocessed']:['reject','cancel','confirm_receipt']).includes(action))return invalid();
 const b=object(raw,['action','expectedRevision']);return {action,expectedRevision:revision(b.expectedRevision)};
}
