import {describe,it,expect} from 'vitest';
import {receipt} from './supply.input';
const line={itemId:'12345678-1234-4123-8123-123456789012',quantity:'2',lotCode:'LOT-01',expiresOn:'2028-02-29'};
describe('receipt lot metadata',()=>{
 it('accepts real dates and preserves legacy receipt bodies',()=>{
  expect(receipt({lines:[line]})).toEqual([line]);expect(receipt({})).toBeNull();
  expect(receipt({lines:[{itemId:line.itemId,quantity:'2'}]})).toEqual([{itemId:line.itemId,quantity:'2'}]);
 });
 it.each(['2027-02-29','2028-02-30','2028-04-31','0000-01-01','2028-01-01T00:00:00Z','01/01/2028'])('rejects invalid date %s',expiresOn=>expect(()=>receipt({lines:[{...line,expiresOn}]})).toThrow());
 it('requires paired fields and rejects control characters and caller scope',()=>{
  for(const bad of [{itemId:line.itemId,quantity:'2',lotCode:'L'},{...line,lotCode:'bad\ncode'},{...line,lotCode:'x'.repeat(81)},{...line,propertyId:line.itemId}])expect(()=>receipt({lines:[bad]})).toThrow();
 });
});
