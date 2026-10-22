import {describe,it,expect} from 'vitest';
import {nextStaySelection,propertyDay,stayNights} from './model';
describe('shared stay calendar (continued from PR 79)',()=>{
 it('selects arrival, departure, then starts a new range',()=>{
  const min='2026-10-22';
  expect(nextStaySelection('','','2026-10-31',min)).toEqual(['2026-10-31','']);
  expect(nextStaySelection('2026-10-31','','2026-11-02',min)).toEqual(['2026-10-31','2026-11-02']);
  expect(nextStaySelection('2026-10-31','2026-11-02','2026-11-03',min)).toEqual(['2026-11-03','']);
 });
 it('earlier or same arrival restarts selection without a zero-night stay',()=>{
  expect(nextStaySelection('2026-11-02','','2026-11-01','2026-10-22')).toEqual(['2026-11-01','']);
  expect(nextStaySelection('2026-11-02','','2026-11-02','2026-10-22')).toEqual(['2026-11-02','']);
 });
 it.each(['2026-10-21','2026-02-30','2026-11-31','bad','0000-01-01'])('ignores invalid or past selection %s',chosen=>{
  expect(nextStaySelection('2026-10-31','',chosen,'2026-10-22')).toEqual(['2026-10-31','']);
 });
 it('uses the property day rather than UTC or the device day',()=>{
  expect(propertyDay(new Date('2026-10-22T18:59:59Z'))).toBe('2026-10-22');
  expect(propertyDay(new Date('2026-10-22T19:00:00Z'))).toBe('2026-10-23');
  expect(propertyDay(new Date('2026-10-22T19:00:00Z'),'America/New_York')).toBe('2026-10-22');
 });
 it('shares validated night arithmetic across month/year/leap/DST boundaries',()=>{
  expect(stayNights('2026-10-31','2026-11-02')).toBe(2);
  expect(stayNights('2026-12-31','2027-01-01')).toBe(1);
  expect(stayNights('2028-02-28','2028-03-01')).toBe(2);
  expect(stayNights('2026-10-25','2026-10-26')).toBe(1);
  expect(stayNights('2026-02-30','2026-03-03')).toBe(0);
 });
});
