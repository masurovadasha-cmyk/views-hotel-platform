import {describe,it,expect} from 'vitest';
import {randomBytes,randomUUID} from 'node:crypto';
import {sealSyntheticDocument,openSyntheticDocument} from './synthetic-document-vault';
describe('synthetic encrypted document binding',()=>{
 it('uses random nonces and authenticates every identity, key and checksum',()=>{
  const key=randomBytes(32).toString('hex'),b={organizationId:randomUUID(),reservationId:randomUUID(),guestId:randomUUID(),documentId:randomUUID()};
  const a=sealSyntheticDocument(b,key),other=sealSyntheticDocument(b,key);
  expect(a.encrypted.equals(other.encrypted)).toBe(false);
  expect(openSyntheticDocument(b,key,a.encrypted,a.checksum)).toContain(b.documentId);
  for(const name of Object.keys(b))expect(()=>openSyntheticDocument({...b,[name]:randomUUID()},key,a.encrypted,a.checksum)).toThrow('SYNTHETIC_DOCUMENT_UNAVAILABLE');
  expect(()=>openSyntheticDocument(b,randomBytes(32).toString('hex'),a.encrypted,a.checksum)).toThrow();
  expect(()=>openSyntheticDocument(b,key,a.encrypted,'0'.repeat(64))).toThrow();
  expect(()=>openSyntheticDocument(b,key,Buffer.alloc(2048),a.checksum)).toThrow();
 });
});
