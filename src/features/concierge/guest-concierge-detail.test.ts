import {describe,it,expect} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {GuestConciergeDetail,parseConciergeDetail} from './GuestConciergeDetail';
const id='10000000-0000-4000-8000-000000000001',now='2026-10-18T12:00:00Z';
const message={id,author:'guest',text:'Help with lunch <script>alert(1)</script>',createdAt:now};
const sla={policy:'concierge-response-15m-v1',hypothesis:true,evaluatedAt:now,responseDueAt:now,state:'pending',overdueSeconds:0,answeredLate:null};
const row={orderId:id,stage:'requested',revision:1,category:'restaurant',partySize:2,budgetMinor:'9007199254740993',currency:'UZS',requestedFor:now,responseDueAt:now,answeredAt:null,assigned:false,messages:[message],sla};
describe('guest concierge detail boundary',()=>{
 it('whitelists details and nested objects without budget or private fields',()=>{
  const parsed=parseConciergeDetail({...row,organizationId:id,staffId:id,unitCode:'PRIVATE',messages:[{...message,staffId:id}],sla:{...sla,staffId:id}});
  expect(Object.keys(parsed).sort()).toEqual(['assigned','category','messages','partySize','requestedFor','responseDueAt','sla'].sort());
  expect(parsed.messages).toEqual([message]);expect(parsed.sla).toEqual(sla);
  expect(JSON.stringify(parsed)).not.toMatch(/staffId|organizationId|PRIVATE|budgetMinor|9007199254740993/);
 });
 it.each([{requestedFor:42},{responseDueAt:'invalid'},{messages:[{...message,createdAt:42}]},{messages:[message,message]},{partySize:51},{messages:[{...message,author:'admin'}]},{budgetMinor:'9223372036854775808'}])('rejects malformed detail %j',patch=>{
  expect(()=>parseConciergeDetail({...row,...patch})).toThrow('INVALID_RESPONSE');
 });
 it.each([{hypothesis:false},{state:'overdue'},{evaluatedAt:'invalid'},{overdueSeconds:1},{answeredLate:false}])('rejects contradictory SLA %j',patch=>{
  expect(()=>parseConciergeDetail({...row,sla:{...sla,...patch}})).toThrow('INVALID_RESPONSE');
 });
 it('retains snapshot status without deriving a live timer from the device clock',()=>{
  expect(parseConciergeDetail(row).sla?.state).toBe('pending');
  expect(parseConciergeDetail({...row,sla:{...sla,evaluatedAt:'2026-10-18T12:00:03Z',state:'overdue',overdueSeconds:3}}).sla?.overdueSeconds).toBe(3);
  expect(parseConciergeDetail({...row,stage:'answered',answeredAt:'2026-10-18T12:00:01Z',sla:{...sla,state:'answered',answeredLate:true}}).sla?.answeredLate).toBe(true);
 });
 it.each(['en','ru','uz'] as const)('renders localized read-only history and explicit SLA limitation in %s',locale=>{
  const html=renderToStaticMarkup(createElement(GuestConciergeDetail,{order:parseConciergeDetail(row),locale}));
  expect(html).toContain('data-testid="guest-concierge-detail"');expect(html).toContain('&lt;script&gt;');
  expect(html).not.toMatch(/<script|<button|<input|budgetMinor|9007199254740993/);
  expect(html).toContain(locale==='ru'?'Целевой срок пилота':locale==='uz'?'Sinov maqsadi':'Pilot target');
 });
 it('discloses missing SLA and empty conversation without synthetic content',()=>{
  const html=renderToStaticMarkup(createElement(GuestConciergeDetail,{order:parseConciergeDetail({...row,sla:undefined,messages:[]}),locale:'en'}));
  expect(html).toContain('SLA status unavailable');expect(html).toContain('No messages yet');
 });
});
