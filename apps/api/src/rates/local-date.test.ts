import {describe,expect,it,vi} from 'vitest';
import {enumerateStayDates,localDateOf} from './local-date';
import {QuoteController} from './quote.controller';
import {QuoteService} from './quote.service';
import type {DatabaseService} from '../database/database.service';
const invalid=['2028-02-30T14:00:00+05:00','2027-02-29T14:00:00Z','2028-04-31T14:00:00Z',
 '2028-04-01T14:00:00','2028-04-01','04/01/2028','2028-04-01T24:00:00Z',
 '2028-04-01T14:00:00+05:60', '2028-04-01T14:00:00+24:00'];
describe('booking instant contract',()=>{
 it.each(invalid)('rejects ambiguous or normalized date %s',value=>{
  expect(()=>localDateOf(value,'Asia/Tashkent')).toThrow('INVALID_INSTANT');
 });
 it('accepts leap day and equivalent explicit offsets',()=>{
  expect(localDateOf('2028-02-29T23:00:00.123Z','Asia/Tashkent')).toBe('2028-03-01');
  expect(localDateOf('2028-03-01T04:00:00.123+05:00','Asia/Tashkent')).toBe('2028-03-01');
 });
 it('rejects inverted actual instants even when written dates appear ordered',()=>{
  expect(()=>enumerateStayDates('2028-04-01T23:00:00-10:00','2028-04-02T01:00:00+14:00','UTC')).toThrow('INVALID_STAY_PERIOD');
 });
 it('counts local nights over spring and autumn DST changes',()=>{
  for(const [from,to] of [['2028-03-25T14:00:00+01:00','2028-03-27T12:00:00+02:00'],['2028-10-28T14:00:00+02:00','2028-10-30T12:00:00+01:00']])
   expect(enumerateStayDates(from,to,'Europe/Berlin').dates).toHaveLength(2);
 });
 it.each([invalid[0],invalid[3]])('quote rejects %s before accessing PostgreSQL',async checkInAt=>{
  const withActor=vi.fn();const service=new QuoteService({withActor} as unknown as DatabaseService);
  await expect(service.createQuote({actor:{organizationId:'o',userId:'u',membershipId:'m',requestId:'r'},propertyId:'p',unitId:'u',ratePlanId:'r',checkInAt,checkOutAt:'2028-04-03T12:00:00Z',guests:[{age:30,residency:'resident'}]})).rejects.toThrow('INVALID_INSTANT');
  expect(withActor).not.toHaveBeenCalled();
 });
});

describe('quote API date errors',()=>{
 it.each(invalid)('returns400 without touching DB for %s',async checkInAt=>{
  const withActor=vi.fn();const controller=new QuoteController(new QuoteService({withActor} as unknown as DatabaseService));
  const id='10000000-0000-4000-8000-000000000001';
  await expect(controller.create(id,id,id,'test',undefined,{propertyId:id,unitId:id,ratePlanId:id,checkInAt,checkOutAt:'2028-04-03T12:00:00Z',guests:[{age:30,residency:'resident'}]})).rejects.toMatchObject({status:400,message:'INVALID_INSTANT'});
  expect(withActor).not.toHaveBeenCalled();
 });
});
