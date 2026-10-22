import {describe,it,expect} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {createElement} from 'react';
import {GuestLaundryDetail,parseLaundryDetail} from './GuestLaundryDetail';
const at='2026-10-18T10:15:00.123456+00:00';
const item={tag:'001',description:'Shirt',priceMinor:'9007199254740993'};
const base={revision:1,declaredCount:1,preferences:'No perfume',pickupAt:at,returnBy:at,currency:'UZS',items:[item],totalMinor:item.priceMinor,claim:null};
describe('guest laundry detail whitelist',()=>{
 it('preserves bigint price and strips internal fields at every level',()=>{
  const result=parseLaundryDetail({...base,staffToken:'secret',items:[{...item,cost:'private'}]});
  expect(result.revision).toBe(1);expect(result.items?.[0]).toEqual(item);expect(JSON.stringify(result)).not.toMatch(/secret|private|staffToken|cost/);
 });
 it.each([undefined,null,0,-1,1.5,Infinity,NaN,Number.MAX_SAFE_INTEGER+1,'1'])('rejects untrusted revision %s',revision=>expect(()=>parseLaundryDetail({...base,revision})).toThrow('INVALID_LAUNDRY_DETAIL'));
 it.each(['0','-1','1.2','01','1e3','9223372036854775808',1])('rejects invalid item money %s',priceMinor=>{
  expect(()=>parseLaundryDetail({...base,items:[{...item,priceMinor}]})).toThrow('INVALID_LAUNDRY_DETAIL');
 });
 it('rejects mismatched totals, duplicate tags and overflowing sums',()=>{
  for(const patch of [{totalMinor:'1'},{items:[item,item]},{items:[{...item,priceMinor:'9223372036854775807'},{...item,tag:'002',priceMinor:'1'}]}])expect(()=>parseLaundryDetail({...base,...patch})).toThrow();
 });
 it('accepts an unquoted request with no inventory or return promise',()=>{
  expect(parseLaundryDetail({...base,items:null,totalMinor:null,returnBy:null}).items).toBeNull();
 });
 it.each([{declaredCount:51},{currency:'JPY'},{preferences:'x'.repeat(501)},{pickupAt:'2026-02-30T10:00:00Z'},{items:[]},{returnBy:'tomorrow'}])('rejects malformed visible fields %j',patch=>expect(()=>parseLaundryDetail({...base,...patch})).toThrow());
 it('allows eight claim messages followed by resolution, stripping extra metadata',()=>{
  const history=Array.from({length:8},(_,i)=>({action:i%2?'answer_claim':'report_claim',at,note:'Synthetic note',...(i%2?{}:{tag:'001',kind:'quality'}),actorId:'private'}));
  const result=parseLaundryDetail({...base,claim:{status:'resolved',tag:'001',kind:'quality',history:[...history,{action:'resolve_claim',at,note:''}]}});
  expect(result.claim?.history).toHaveLength(9);expect(JSON.stringify(result)).not.toContain('private');
 });
 it.each([{status:'paid'},{tag:'OTHER'},{history:[]},{history:[{action:'refund',at,note:'x'}]}])('rejects malformed claims %j',patch=>{
  expect(()=>parseLaundryDetail({...base,claim:{status:'open',tag:'001',kind:'quality',history:[{action:'report_claim',at,note:'Concern',tag:'001',kind:'quality'}],...patch}})).toThrow();
 });
 it('renders localized read-only item cards with exact amounts and requested pickup wording',()=>{
  for(const [locale,label] of [['en','Requested pickup'],['ru','Запрошенный забор'],['uz','So‘ralgan olib ketish']] as const){
   const html=renderToStaticMarkup(createElement(GuestLaundryDetail,{order:parseLaundryDetail(base),locale}));
   expect(html).toContain(label);expect(html).toContain('001');expect(html).not.toMatch(/<button|<form|paid|refund/);
   if(locale==='en')expect(html).toContain('90,071,992,547,409.93 UZS');
  }
 });
});
