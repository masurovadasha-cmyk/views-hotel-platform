import {createCipheriv,createDecipheriv,createHash,createHmac,timingSafeEqual,randomBytes} from 'node:crypto';
export const SYNTHETIC_VAULT='views-synthetic-document-v1';
export type DocumentBinding={organizationId:string;reservationId:string;guestId:string;documentId:string};
function aad(b:DocumentBinding){
 const ids=[b.organizationId,b.reservationId,b.guestId,b.documentId];
 if(!ids.every(id=>/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(id)))throw Error('SYNTHETIC_DOCUMENT_INVALID');
 return Buffer.from(JSON.stringify([SYNTHETIC_VAULT,...ids]));
}
function key(hex:string){if(!/^[a-f0-9]{64}$/.test(hex))throw Error('SYNTHETIC_VAULT_UNAVAILABLE');return Buffer.from(hex,'hex');}
function content(b:DocumentBinding){return 'VIEWS — SYNTHETIC TEST FILE\nNot an identity document. No real personal data.\nDocument: '+b.documentId;}
export function sealSyntheticDocument(b:DocumentBinding,hex:string){
 const nonce=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key(hex),nonce);cipher.setAAD(aad(b));
 const text=content(b),encrypted=Buffer.concat([cipher.update(text,'utf8'),cipher.final()]);
 return {encrypted:Buffer.concat([nonce,cipher.getAuthTag(),encrypted]),checksum:createHash('sha256').update(text).digest('hex')};
}
export function openSyntheticDocument(b:DocumentBinding,hex:string,encrypted:Buffer,checksum:string){
 try{
  if(!Buffer.isBuffer(encrypted)||encrypted.length<29||encrypted.length>1024)throw Error();
  const decipher=createDecipheriv('aes-256-gcm',key(hex),encrypted.subarray(0,12));
  decipher.setAAD(aad(b));decipher.setAuthTag(encrypted.subarray(12,28));
  const text=Buffer.concat([decipher.update(encrypted.subarray(28)),decipher.final()]).toString('utf8');
  if(text!==content(b)||createHash('sha256').update(text).digest('hex')!==checksum)throw Error();
  return text;
 }catch{throw Error('SYNTHETIC_DOCUMENT_UNAVAILABLE');}
}

// A short-lived receipt proves which synthetic bytes this live session fetched.
// It does not prove that a person read or understood them.
export type ReviewReceipt={organizationId:string;reservationId:string;documentId:string;membershipId:string;sessionHash:string;checksum:string;stamp:string;expiresAt:number};
export function issueReviewReceipt(value:ReviewReceipt,hex:string){
 const payload=Buffer.from(JSON.stringify(value)).toString('base64url');
 return payload+'.'+createHmac('sha256',key(hex)).update('synthetic-review-v1:'+payload).digest('hex');
}
export function readReviewReceipt(token:string,hex:string):ReviewReceipt{
 try{
  if(typeof token!=='string'||token.length>2048)throw Error();
  const [payload,signature,...rest]=token.split('.');
  if(rest.length||! /^[a-f0-9]{64}$/.test(signature||''))throw Error();
  const expected=createHmac('sha256',key(hex)).update('synthetic-review-v1:'+payload).digest();
  if(!timingSafeEqual(expected,Buffer.from(signature,'hex')))throw Error();
  return JSON.parse(Buffer.from(payload,'base64url').toString('utf8')) as ReviewReceipt;
 }catch{throw Error('DOCUMENT_REVIEW_RECEIPT_INVALID');}
}
