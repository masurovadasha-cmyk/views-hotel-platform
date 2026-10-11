import {describe,it,expect} from 'vitest';
import {laundryAction,laundryRequest} from './laundry.input';
const item={tag:'001',description:'Shirt',priceMinor:'9007199254740993'};
const quote={action:'quote',expectedRevision:1,items:[item],returnBy:'2037-01-01T10:00:00.000Z'};
describe('laundry command boundaries',()=>{
 it('preserves bigint item money and rejects duplicate tags, overflow and injected fields',()=>{
  expect(laundryAction(quote,true)).toMatchObject({items:[item]});
  for(const items of [[],[item,item],[{...item,priceMinor:100}],[{...item,priceMinor:'9223372036854775808'}],[{...item,description:'\n'}],[{...item,tag:'bad tag'}],[item,{...item,tag:'002',priceMinor:'9223372036854775807'}]])expect(()=>laundryAction({...quote,items},true)).toThrow();
  expect(()=>laundryAction({...quote,discount:1},true)).toThrow();
 });
 it('separates guest consent from staff execution',()=>{
  expect(()=>laundryAction(quote,false)).toThrow();expect(()=>laundryAction({action:'confirm_receipt',expectedRevision:1},true)).toThrow();
  expect(()=>laundryAction({action:'accept',expectedRevision:1,expectedTotalMinor:100},false)).toThrow();
  expect(()=>laundryRequest({})).toThrow();
 });
});
