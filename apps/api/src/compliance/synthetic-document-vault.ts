import {createCipheriv,createDecipheriv,createHash,randomBytes} from 'node:crypto';
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
