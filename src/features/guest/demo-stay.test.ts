import {describe,it,expect} from 'vitest';
import {demoStayKey,loadDemoStay,parseDemoStay,saveDemoStay} from './demo-stay';
const now=new Date('2026-10-31T19:30:00Z'); // Already November 1 in Asia/Tashkent.
describe('saved demo stay preference',()=>{
 it('restores a valid cross-month saved range without changing date-only strings',()=>{
  expect(parseDemoStay('["2026-11-30","2026-12-02"]',now)).toEqual(['2026-11-30','2026-12-02']);
 });
 it.each([null,'broken','null','{}','[]','["2026-11-02"]','["2026-11-02",1]','["2026-11-02",""]','["2026-11-02","2026-11-02"]','["2026-11-03","2026-11-02"]','["2026-02-30","2026-03-02"]','["2026-10-31","2026-11-03"]'])('does not restore malformed, partial, reversed or property-past dates: %s',raw=>{
  expect(parseDemoStay(raw,now)).toEqual(['','']);
 });
 it('preserves the last saved range when an unfinished draft is supplied; explicit Reset and Save clears it',()=>{
  let raw='["2026-11-30","2026-12-02"]';const storage={getItem:()=>raw,setItem:(key:string,value:string)=>{expect(key).toBe(demoStayKey);raw=value;}};
  saveDemoStay(storage,['2026-12-05',''],now);expect(loadDemoStay(storage,now)).toEqual(['2026-11-30','2026-12-02']);
  saveDemoStay(storage,['',''],now);expect(loadDemoStay(storage,now)).toEqual(['','']);
 });
 it('does not break the calendar if browser storage is blocked',()=>{
  const storage={getItem:()=>{throw Error('blocked');},setItem:()=>{throw Error('quota');}};
  expect(loadDemoStay(storage,now)).toEqual(['','']);expect(()=>saveDemoStay(storage,['2026-11-30','2026-12-02'],now)).not.toThrow();
 });
});
