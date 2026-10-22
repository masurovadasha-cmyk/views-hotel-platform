import {describe,it,expect} from 'vitest';
import {inventoryValid,majorPrice,priceMinor} from './model';
describe('laundry quote amounts',()=>{
 it('keeps exact amounts above safe integer, rejects overflow and sub-minor prices',()=>{
  expect(priceMinor('90071992547409.93')).toBe('9007199254740993');
  expect(majorPrice('9007199254740993')).toBe('90071992547409.93');
  expect(priceMinor('180000,5')).toBe('18000050');
  for(const bad of ['-1','0','1.001','1e5','92233720368547758.08'])expect(priceMinor(bad)).toBeNull();
 });
 it('rejects duplicate tags and sum overflow even when each item price is valid',()=>{
  const one={tag:'001',description:'Shirt',priceMinor:'9223372036854775807'};
  expect(inventoryValid([one])).toBe(true);
  expect(inventoryValid([one,one])).toBe(false);
  expect(inventoryValid([one,{...one,tag:'002',priceMinor:'1'}])).toBe(false);
 });
});
