import {describe,expect,it} from 'vitest';
import {inventoryDraft} from './owner-inventory.input';
const input={name:'Объект',city:'Ташкент',address:'Адрес',unitTypeName:'Стандарт',maxGuests:2,unitCodes:['101'],nightlyMinor:'10000000',freeCancellationHours:48};
describe('inventory draft input',()=>{
 it('rejects injected authority, duplicate codes, unsafe numbers and invalid limits',()=>{
  for(const patch of [{organizationId:'other'},{nightlyMinor:1},{nightlyMinor:'1e8'},{nightlyMinor:'-1'},{nightlyMinor:'1000000000000000'},{unitCodes:['101','101']},{unitCodes:[]},{unitCodes:Array.from({length:101},(_,i)=>String(i))},{maxGuests:0},{maxGuests:2.5},{freeCancellationHours:0},{name:'<script>'},{name:' space '},{city:'\u202etest'}])expect(()=>inventoryDraft({...input,...patch})).toThrow('INVALID_INVENTORY_DRAFT');
 });
 it('preserves bigint money and validates minimum and maximum fund sizes',()=>{
  expect(inventoryDraft({...input,nightlyMinor:'900719925474099'}).nightlyMinor).toBe('900719925474099');
  expect(inventoryDraft({...input,unitCodes:Array.from({length:100},(_,i)=>String(i))}).unitCodes).toHaveLength(100);
 });
});
