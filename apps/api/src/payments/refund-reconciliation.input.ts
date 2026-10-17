import {BadRequestException} from '@nestjs/common';
import {createHash} from 'node:crypto';

const UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
export const refundStates=['pending','processing','submitted','uncertain','blocked','completed'] as const;
export type RefundState=typeof refundStates[number];
export type ReviewAction='investigating'|'provider_contacted'|'evidence_requested';
export function reconciliationId(value:unknown){
 if(typeof value!=='string'||!UUID.test(value))throw new BadRequestException('INVALID_RECONCILIATION_ID');
 return value.toLowerCase();
}
export function queueQuery(input:{propertyId?:unknown;status?:unknown;cursor?:unknown}){
 const propertyId=reconciliationId(input.propertyId),status=input.status??'attention';
 if(typeof status!=='string'||(status!=='attention'&&!refundStates.includes(status as RefundState)))throw new BadRequestException('INVALID_REFUND_STATUS');
 const digest=createHash('sha256').update(JSON.stringify({propertyId,status})).digest('hex');
 let after:string|null=null;
 if(input.cursor!==undefined){
  try{
   if(typeof input.cursor!=='string'||input.cursor.length>250)throw Error();
   const cursor:unknown=JSON.parse(Buffer.from(input.cursor,'base64url').toString('utf8'));
   if(!Array.isArray(cursor)||cursor.length!==2||cursor[0]!==digest)throw Error();
   after=reconciliationId(cursor[1]);
  }catch{throw new BadRequestException('INVALID_REFUND_CURSOR');}
 }
 return {propertyId,status,digest,after};
}
export function reviewInput(body:unknown){
 if(!body||typeof body!=='object'||Array.isArray(body))throw new BadRequestException('INVALID_REFUND_REVIEW');
 const row=body as Record<string,unknown>;
 if(Object.keys(row).some(k=>!['expectedRevision','action','caseReference'].includes(k))||
  typeof row.expectedRevision!=='string'||!/^[a-f0-9]{64}$/.test(row.expectedRevision)||
  !['investigating','provider_contacted','evidence_requested'].includes(String(row.action))||
  typeof row.caseReference!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,99}$/.test(row.caseReference))throw new BadRequestException('INVALID_REFUND_REVIEW');
 return {expectedRevision:row.expectedRevision,action:row.action as ReviewAction,caseReference:row.caseReference};
}
