import {describe,expect,it} from 'vitest';
import {marketCartLines,marketProducts,setMarketQuantity} from './market-catalog';
import messages from './market-translations.json';
describe('V Market shopping list boundary',()=>{
 it('changes and removes quantities without mutating the previous list',()=>{
  const cart=Object.freeze({'sample-water':2});
  const changed=setMarketQuantity(cart,'sample-water',3);
  expect(cart['sample-water']).toBe(2);expect(changed['sample-water']).toBe(3);
  expect(setMarketQuantity(changed,'sample-water',0)).toEqual({});
  expect(marketCartLines(changed).map(line=>line.quantity)).toEqual([3]);
 });
 it('rejects unknown SKUs, nonintegers and out-of-range quantities',()=>{
  const cart={'sample-water':1};
  for(const quantity of [-1,.5,21,NaN,Infinity])expect(setMarketQuantity(cart,'sample-water',quantity)).toBe(cart);
  for(const id of ['warehouse-real-sku','__proto__','constructor'])expect(setMarketQuantity(cart,id,2)).toBe(cart);
  expect(marketCartLines({'unknown':3,'sample-water':21,'sample-tea':1.5})).toEqual([]);
  expect(marketCartLines(setMarketQuantity(cart,'sample-water',20))[0].quantity).toBe(20);
 });
 it('keeps all sample names, packs and categories translated without asserting prices or stock',()=>{
  for(const product of marketProducts){
   expect(product.id).toMatch(/^sample-/);expect(product).not.toHaveProperty('price');expect(product).not.toHaveProperty('stock');
   for(const key of [product.name,product.size,product.category])for(const locale of ['ru','uz'] as const)expect((messages as Record<string,Record<string,string>>)[key][locale]).toBeTruthy();
  }
 });
});
