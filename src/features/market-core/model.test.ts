import {describe,it,expect} from 'vitest';
import {cartTotal,validCart,type CartLine} from './model';
const line:CartLine={product:{id:'a',name:{en:'Water'},revision:1,priceMinor:'9007199254740993',currency:'UZS',availableQuantity:'2'},quantity:2};
describe('market basket',()=>{
 it('preserves exact amounts and rejects unavailable or mixed currency orders',()=>{
  expect(cartTotal([line])).toBe('18014398509481986');expect(validCart([line])).toBe(true);
  expect(validCart([{...line,quantity:3}])).toBe(false);expect(validCart([{...line,quantity:1.2}])).toBe(false);
  expect(validCart([line,{...line,product:{...line.product,id:'b',currency:'EUR'}}])).toBe(false);
 });
 it('rejects duplicate, empty and overflowing carts',()=>{
  expect(validCart([])).toBe(false);expect(validCart([line,line])).toBe(false);
  expect(validCart([{...line,product:{...line.product,priceMinor:'9223372036854775807'}}])).toBe(false);
 });
});
