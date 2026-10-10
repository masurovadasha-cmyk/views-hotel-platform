import {describe,it,expect} from 'vitest';
import {calendarCommand,calendarWindow} from './owner-calendar.input';
const input={action:'block',unitId:'00000000-0000-0000-0000-000000000004',kind:'maintenance',start:'2027-01-01T14:00+05:00',end:'2027-01-02T12:00+05:00'};
describe('owner calendar input',()=>{
 it('accepts explicit Tashkent local minutes and bounded windows',()=>{
  expect(calendarCommand(input)).toEqual(input);expect(calendarWindow('2028-02-29','2028-03-01').start).toBe('2028-02-29T00:00+05:00');
 });
 it('rejects impossible or ambiguous times, financial kinds, authority and unbounded requests',()=>{
  for(const patch of [{kind:'payment_hold'},{start:'2027-02-29T14:00+05:00'},{start:'2027-01-01T24:00+05:00'},{start:'2027-01-01T14:00'},{start:'2027-01-01T09:00Z'},{end:input.start},{end:'2029-01-01T12:00+05:00'},{propertyId:input.unitId},{expiresAt:null},{unitId:'other'}])expect(()=>calendarCommand({...input,...patch})).toThrow('INVALID_CALENDAR_INPUT');
  for(const [from,to] of [['2027-01-01','2027-01-01'],['2027-01-01','2027-04-01'],['2027-02-30','2027-03-02'],['2027-1-1','2027-01-02']])expect(()=>calendarWindow(from,to)).toThrow();
 });
 it('unblock accepts only the period ID and no reservation override',()=>{
  expect(calendarCommand({action:'unblock',periodId:input.unitId})).toEqual({action:'unblock',periodId:input.unitId});
  expect(()=>calendarCommand({action:'unblock',periodId:input.unitId,force:true})).toThrow();
 });
});
