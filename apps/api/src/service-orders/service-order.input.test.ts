import {describe,it,expect} from 'vitest';
import {requestInput,actionInput} from './service-order.input';
const id='76800000-0000-4000-8000-000000000001';
const request={reservationId:id,serviceId:id,expectedRevision:1,expectedPriceMinor:'9007199254740993',requestedFor:'2037-01-01T10:00:00.000Z'};
describe('service command boundaries',()=>{
 it('keeps exact bigint quote acceptance and rejects invalid money/date or injected fields',()=>{
  expect(requestInput(request).expectedPriceMinor).toBe('9007199254740993');
  for(const bad of [{...request,expectedPriceMinor:100},{...request,expectedPriceMinor:'9223372036854775808'},{...request,requestedFor:'2037-02-31T10:00:00.000Z'},{...request,expectedRevision:0},{...request,status:'completed'},{...request,expectedPriceMinor:'0'}])expect(()=>requestInput(bad)).toThrow('SERVICE_INPUT_INVALID');
 });
 it('requires all actual boolean checklist items and a bounded note; forbids extras',()=>{
  const command={action:'submit',expectedRevision:3,checklist:{linen:true,bathroom:true,floor:true},note:' Ready '};expect(actionInput(command)).toMatchObject({note:'Ready'});
  for(const checklist of [{linen:true,bathroom:true},{linen:true,bathroom:true,floor:'true'},{linen:true,bathroom:true,floor:true,photos:true}])expect(()=>actionInput({...command,checklist})).toThrow();
  expect(()=>actionInput({...command,note:' '})).toThrow();expect(()=>actionInput({...command,note:'x'.repeat(501)})).toThrow();
  expect(()=>actionInput({action:'approve',expectedRevision:4,note:'OK',amountMinor:'1'})).toThrow();
 });
});
