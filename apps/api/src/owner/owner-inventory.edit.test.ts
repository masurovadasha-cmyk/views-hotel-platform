import {describe,it,expect} from 'vitest';
import {inventoryEdit} from './owner-inventory.edit';
const category={id:null,name:'Double',maxGuests:2,units:[{id:null,code:'A1'}],nightlyMinor:'900719925474099',freeCancellationHours:48};
const input={revision:'a'.repeat(64),name:'Property',city:'Tashkent',address:'Address',categories:[category]};
describe('inventory aggregate editing input',()=>{
 it('rejects injected authority, duplicate codes across categories and invalid references',()=>{
  for(const patch of [{organizationId:'injected'},{revision:'old'},{categories:[]},{categories:[{...category,active:true}]},{categories:[category,{...category,name:'Other'}]},{categories:[category,{...category,units:[{id:null,code:'B1'}]}]},{categories:[{...category,id:'not-uuid'}]},{categories:[{...category,units:[{id:null,code:'a1'}]}]},{categories:[{...category,nightlyMinor:1}]},{categories:[{...category,freeCancellationHours:721}]}])expect(()=>inventoryEdit({...input,...patch})).toThrow('INVALID_INVENTORY_DRAFT');
 });
 it('bounds total categories and rooms and keeps exact money',()=>{
  expect(inventoryEdit(input).categories[0].nightlyMinor).toBe('900719925474099');
  const categories=Array.from({length:20},(_,i)=>({...category,name:'Type '+i,units:Array.from({length:5},(_,j)=>({id:null,code:`${i}_${j}`}))}));
  expect(inventoryEdit({...input,categories}).categories).toHaveLength(20);
  expect(()=>inventoryEdit({...input,categories:[...categories,{...category,name:'21'}]})).toThrow();
  categories[0].units.push({id:null,code:'EXTRA'});expect(()=>inventoryEdit({...input,categories})).toThrow();
 });
 it('canonicalizes reordered categories and rooms for a safe replay',()=>{
  const categories=[{...category,name:'B',units:[{id:null,code:'B2'},{id:null,code:'B1'}]},{...category,name:'A'}];
  expect(inventoryEdit({...input,categories})).toEqual(inventoryEdit({...input,categories:[categories[1],{...categories[0],units:[...categories[0].units].reverse()}]}));
 });
});
