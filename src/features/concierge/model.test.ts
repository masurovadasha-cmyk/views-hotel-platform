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
