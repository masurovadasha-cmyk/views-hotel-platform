import {describe,it,expect} from 'vitest';
import {marketRequest,marketAction} from './market.input';
const id='12345678-1234-4123-8123-123456789012',body={reservationId:id,lines:[{serviceId:id,quantity:1,expectedRevision:1}],expectedTotalMinor:'100'};
describe('market input boundaries',()=>{
 it('rejects spoofed scope, floating quantities, duplicate products and numeric money',()=>{
  expect(marketRequest(body)).toEqual(body);
  for(const b of [{...body,propertyId:id},{...body,expectedTotalMinor:100},{...body,lines:[{...body.lines[0],quantity:1.1}]},{...body,lines:[body.lines[0],body.lines[0]]}])expect(()=>marketRequest(b)).toThrow('SERVICE_INPUT_INVALID');
 });
 it('bounds issue notes and separates reporting from staff responses',()=>{
  expect(marketAction({action:'report_issue',expectedRevision:2,note:'  Missing water  '},false)).toMatchObject({note:'Missing water'});
  for(const note of ['', 'a', 'x'.repeat(1001),42])expect(()=>marketAction({action:'report_issue',expectedRevision:2,note},false)).toThrow();
  expect(()=>marketAction({action:'answer_issue',expectedRevision:2,note:'Checked'},false)).toThrow();
  expect(()=>marketAction({action:'report_issue',expectedRevision:2,note:'Checked'},true)).toThrow();
 });
 it('separates guest and warehouse transitions and requires complete picking checklist',()=>{
  expect(()=>marketAction({action:'handover',expectedRevision:1},false)).toThrow();
  expect(()=>marketAction({action:'confirm_receipt',expectedRevision:1},true)).toThrow();
  expect(()=>marketAction({action:'ready',expectedRevision:1,checklist:{quantities:true,expiry:false,packaging:true}},true)).toThrow();
 });
});
