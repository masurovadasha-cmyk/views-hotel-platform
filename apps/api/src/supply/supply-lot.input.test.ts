import {describe,it,expect} from 'vitest';
import {receipt,issue} from './supply.input';
const line={itemId:'12345678-1234-4123-8123-123456789012',quantity:'2',lotCode:'LOT-01',expiresOn:'2028-02-29'};
describe('receipt lot metadata',()=>{
 it('validates optional single-lot issue provenance without accepting caller allocations',()=>{
  const body={propertyId:line.itemId,itemId:line.itemId,quantity:'1',reference:'Physical issue'},lotAllocation={snapshotId:line.itemId,lotCode:'A',expiresOn:'2028-02-29'};
  expect(issue({...body,lotAllocation}).lotAllocation).toEqual(lotAllocation);expect(issue(body).lotAllocation).toBeUndefined();expect(issue({...body,lotAllocation:{...lotAllocation,movementId:line.itemId}}).lotAllocation).toMatchObject({movementId:line.itemId});expect(()=>issue({...body,lotAllocation:{...lotAllocation,movementId:'bad'}})).toThrow();
  for(const changed of [{...lotAllocation,snapshotId:'bad'},{...lotAllocation,expiresOn:'2027-02-29'},{...lotAllocation,quantity:'99'},{...lotAllocation,lotCode:null}])expect(()=>issue({...body,lotAllocation:changed})).toThrow();
 });
 it('accepts real dates and preserves legacy receipt bodies',()=>{
  expect(receipt({lines:[line]})).toEqual([line]);expect(receipt({})).toBeNull();
  expect(receipt({lines:[{itemId:line.itemId,quantity:'2'}]})).toEqual([{itemId:line.itemId,quantity:'2'}]);
 });
 it.each(['2027-02-29','2028-02-30','2028-04-31','0000-01-01','2028-01-01T00:00:00Z','01/01/2028'])('rejects invalid date %s',expiresOn=>expect(()=>receipt({lines:[{...line,expiresOn}]})).toThrow());
 it('requires paired fields and rejects control characters and caller scope',()=>{
  for(const bad of [{itemId:line.itemId,quantity:'2',lotCode:'L'},{...line,lotCode:'bad\ncode'},{...line,lotCode:'x'.repeat(81)},{...line,propertyId:line.itemId}])expect(()=>receipt({lines:[bad]})).toThrow();
 });
});
