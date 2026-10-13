import {describe,it,expect} from 'vitest';
import {marketRequest,marketAction,marketCredit} from './market.input';
const id='12345678-1234-4123-8123-123456789012',body={reservationId:id,lines:[{serviceId:id,quantity:1,expectedRevision:1}],expectedTotalMinor:'100'};
describe('market input boundaries',()=>{
 it('requires explicit warehouse confirmation to reopen picking',()=>{
  const b={action:'reopen_picking',expectedRevision:1,returnedToStorage:true,note:'Goods returned to storage'};
  expect(marketAction(b,true)).toEqual(b);expect(()=>marketAction(b,false)).toThrow();
  for(const extra of [{returnedToStorage:false},{returnedToStorage:'true'},{note:' '},{propertyId:id}])expect(()=>marketAction({...b,...extra},true)).toThrow();
 });
 it('accepts only warehouse quantity reduction requests without client prices',()=>{
  const b={action:'propose_quantity',expectedRevision:1,fromServiceId:id,quantity:1,note:'Only one available'};
  expect(marketAction(b,true)).toEqual(b);expect(()=>marketAction(b,false)).toThrow();
  expect(marketAction({...b,quantity:0},true)).toMatchObject({quantity:0});
  for(const quantity of [-1,1.5,51,'1'])expect(()=>marketAction({...b,quantity},true)).toThrow();
  expect(()=>marketAction({...b,expectedTotalMinor:'1'},true)).toThrow();
 });
 it('rejects spoofed scope, floating quantities, duplicate products and numeric money',()=>{
  expect(marketRequest(body)).toEqual(body);
  for(const b of [{...body,propertyId:id},{...body,expectedTotalMinor:100},{...body,lines:[{...body.lines[0],quantity:1.1}]},{...body,lines:[body.lines[0],body.lines[0]]}])expect(()=>marketRequest(b)).toThrow('SERVICE_INPUT_INVALID');
 });
 it('bounds physical returns and requires all inspection checks',()=>{
  expect(marketAction({action:'receive_return',expectedRevision:1,serviceId:id,quantity:1,note:'Received physically'},true)).toMatchObject({quantity:1});
  expect(()=>marketAction({action:'receive_return',expectedRevision:1,serviceId:id,quantity:1.5,note:'Received physically'},true)).toThrow();
  expect(()=>marketAction({action:'restock_return',expectedRevision:1,returnId:id,note:'Inspected',checklist:{sealed:false,expiry:true,quality:true}},true)).toThrow();
 });
 it('requires a bounded exact credit amount and reason',()=>{
  const b={expectedRevision:1,amountMinor:'9007199254740993',reason:'Missing item'};expect(marketCredit(b)).toEqual(b);
  for(const bad of [{...b,amountMinor:100},{...b,amountMinor:'-1'},{...b,amountMinor:'0'},{...b,reason:' '},{...b,organizationId:id}])expect(()=>marketCredit(bad)).toThrow();
 });
 it('separates warehouse proposals from guest consent and forbids invented totals',()=>{
  const proposal={action:'propose_replacement',expectedRevision:1,fromServiceId:id,toServiceId:'12345678-1234-4123-8123-123456789013',note:'Alternative product'};
  expect(marketAction(proposal,true)).toEqual(proposal);expect(()=>marketAction(proposal,false)).toThrow();
  expect(()=>marketAction({...proposal,expectedTotalMinor:'100'},true)).toThrow();
  expect(()=>marketAction({...proposal,toServiceId:id},true)).toThrow();
  expect(()=>marketAction({action:'accept_proposal',expectedRevision:1,expectedTotalMinor:100},false)).toThrow();
  expect(()=>marketAction({action:'accept_proposal',expectedRevision:1,expectedTotalMinor:'100'},true)).toThrow();
 });
 it('requires guest consent fields for a complete replacement basket',()=>{
  const replacement={action:'replace_order',expectedRevision:1,lines:body.lines,expectedTotalMinor:'100'};
  expect(marketAction(replacement,false)).toEqual(replacement);
  for(const b of [{...replacement,reservationId:id},{...replacement,lines:[]},{...replacement,expectedTotalMinor:100},{...replacement,expectedRevision:0}])expect(()=>marketAction(b,false)).toThrow();
  expect(()=>marketAction(replacement,true)).toThrow();
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
