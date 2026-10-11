import {describe,it,expect} from 'vitest';
import {parseConciergePage} from './model';
const id='10000000-0000-4000-8000-000000000001',now='2026-10-12T12:00:00Z';
const row={orderId:id,stage:'requested',revision:1,category:'help',partySize:2,budgetMinor:'9007199254740993',currency:'UZS',requestedFor:now,responseDueAt:now,answeredAt:null,assigned:false,messages:[{id,author:'guest',text:'Help',createdAt:now}]};
describe('concierge response boundary',()=>{
 it('preserves exact budgets and bounded messages',()=>expect(parseConciergePage({items:[row],nextCursor:null}).items[0].budgetMinor).toBe('9007199254740993'));
 it('rejects invalid stages, dates, amounts, author and oversized history',()=>{
  for(const patch of [{stage:'paid'},{responseDueAt:'invalid'},{budgetMinor:'9223372036854775808'},{messages:[{...row.messages[0],author:'admin'}]},{messages:Array(101).fill(row.messages[0])}])expect(()=>parseConciergePage({items:[{...row,...patch}],nextCursor:null})).toThrow('INVALID_RESPONSE');
 });
});

describe('server SLA snapshot boundary',()=>{
 const sla={policy:'concierge-response-15m-v1',hypothesis:true,evaluatedAt:now,responseDueAt:now,state:'pending',overdueSeconds:0,answeredLate:null};
 const parse=(patch:Record<string,unknown>={},order:Record<string,unknown>={})=>parseConciergePage({items:[{...row,...order,sla:{...sla,...patch}}],nextCursor:null}).items[0];
 it('uses server snapshot at exact deadline, tolerating legacy receipts without SLA',()=>{
  expect(parse().sla?.state).toBe('pending');
  expect(parseConciergePage({items:[row],nextCursor:null}).items[0].sla).toBeUndefined();
  expect(parse({evaluatedAt:'2026-10-12T12:00:01Z',state:'overdue',overdueSeconds:1}).sla?.overdueSeconds).toBe(1);
 });
 it('rejects contradictory, malformed or silently changed SLA projections',()=>{
  for(const patch of [{policy:'guaranteed'},{hypothesis:false},{evaluatedAt:'invalid'},{responseDueAt:'2026-10-12T12:01:00Z'},{overdueSeconds:-1},{overdueSeconds:0.5},{state:'overdue'},{answeredLate:false},{evaluatedAt:'2026-10-12T12:00:01Z'}])expect(()=>parse(patch)).toThrow('INVALID_RESPONSE');
 });
 it('keeps completed-late evidence without presenting a running overdue timer',()=>{
  expect(parse({state:'answered',answeredLate:true,evaluatedAt:'2026-10-12T12:10:00Z'},{stage:'answered',answeredAt:'2026-10-12T12:00:01Z'}).sla?.answeredLate).toBe(true);
  expect(parse({state:'closed',answeredLate:false},{stage:'closed',answeredAt:now}).sla?.answeredLate).toBe(false);
  expect(parse({state:'cancelled',evaluatedAt:'2026-10-12T12:10:00Z'},{stage:'cancelled'}).sla?.overdueSeconds).toBe(0);
  expect(()=>parse({state:'answered',answeredLate:false},{stage:'answered',answeredAt:'2026-10-12T12:00:01Z'})).toThrow('INVALID_RESPONSE');
 });
});
