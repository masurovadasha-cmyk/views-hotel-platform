import {invalid,object,uuid,revision} from './service-order.input';
function basket(b:Record<string,unknown>){
 if(typeof b.expectedTotalMinor!=='string'||!/^[1-9]\d{0,18}$/.test(b.expectedTotalMinor)||BigInt(b.expectedTotalMinor)>9223372036854775807n)return invalid();
 if(!Array.isArray(b.lines)||b.lines.length<1||b.lines.length>20)return invalid();
 const lines=b.lines.map(raw=>{const l=object(raw,['serviceId','quantity','expectedRevision']);if(!Number.isInteger(l.quantity)||(l.quantity as number)<1||(l.quantity as number)>50)return invalid();return {serviceId:uuid(l.serviceId),quantity:l.quantity as number,expectedRevision:revision(l.expectedRevision)};});
 if(new Set(lines.map(l=>l.serviceId)).size!==lines.length)return invalid();
 return {lines,expectedTotalMinor:b.expectedTotalMinor};
}
export function marketRequest(raw:unknown){
 const b=object(raw,['reservationId','lines','expectedTotalMinor']);
 return {reservationId:uuid(b.reservationId),...basket(b)};
}
export function marketAction(raw:unknown,staff:boolean){
 if(!raw||typeof raw!=='object'||!('action' in raw))return invalid();
 const action=raw.action;
 if(staff&&action==='propose_replacement'){
  const b=object(raw,['action','expectedRevision','fromServiceId','toServiceId','note']);
  if(typeof b.note!=='string'||b.note.trim().length<3||b.note.trim().length>500)return invalid();
  const fromServiceId=uuid(b.fromServiceId),toServiceId=uuid(b.toServiceId);if(fromServiceId===toServiceId)return invalid();
  return {action,expectedRevision:revision(b.expectedRevision),fromServiceId,toServiceId,note:b.note.trim()};
 }
 if(!staff&&action==='accept_proposal'){
  const b=object(raw,['action','expectedRevision','expectedTotalMinor']);
  if(typeof b.expectedTotalMinor!=='string'||!/^[1-9]\d{0,18}$/.test(b.expectedTotalMinor)||BigInt(b.expectedTotalMinor)>9223372036854775807n)return invalid();
  return {action,expectedRevision:revision(b.expectedRevision),expectedTotalMinor:b.expectedTotalMinor};
 }
 if((staff&&action==='withdraw_proposal')||(!staff&&action==='decline_proposal')){
  const b=object(raw,['action','expectedRevision']);return {action,expectedRevision:revision(b.expectedRevision)};
 }

 if(!staff&&action==='replace_order'){
  const b=object(raw,['action','expectedRevision','lines','expectedTotalMinor']);
  return {action,expectedRevision:revision(b.expectedRevision),...basket(b)};
 }
 if ((!staff&&action==='report_issue')||(staff&&action==='answer_issue')) {
  const b=object(raw,['action','expectedRevision','note']);
  if(typeof b.note!=='string'||b.note.trim().length<3||b.note.trim().length>1000)return invalid();
  return {action,expectedRevision:revision(b.expectedRevision),note:b.note.trim()};
 }
 if(staff&&action==='ready'){
  const b=object(raw,['action','expectedRevision','checklist']),c=object(b.checklist,['quantities','expiry','packaging']);
  if(c.quantities!==true||c.expiry!==true||c.packaging!==true)return invalid();return {action,expectedRevision:revision(b.expectedRevision),checklist:{quantities:true,expiry:true,packaging:true}};
 }
 if(typeof action!=='string'||!(staff?['pick','handover','cancel']:['cancel','confirm_receipt']).includes(action))return invalid();
 const b=object(raw,['action','expectedRevision']);return {action,expectedRevision:revision(b.expectedRevision)};
}
