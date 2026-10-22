import {describe,expect,it} from 'vitest';
import {ratesEdit} from './owner-rates.input';
const base={revision:'a'.repeat(64),from:'2028-06-01',to:'2028-06-10',baseNightlyMinor:'123456789012345',days:[],weekdays:[]};
const rule={nightlyMinor:null,minStay:null,closed:false,closedToArrival:false,closedToDeparture:false};
describe('rate edit boundary',()=>{
 it('preserves exact decimal strings',()=>expect(ratesEdit(base).baseNightlyMinor).toBe('123456789012345'));
 it.each([1,'-1','1.1','01','1e3','9999999999999999'])('rejects unsafe money %s',value=>expect(()=>ratesEdit({...base,baseNightlyMinor:value})).toThrow('INVALID_RATE_EDIT'));
 it.each([
  {extra:true},{revision:'x'}, {from:'2028-02-30'}, {to:'2029-01-01'},
  {days:[{...rule,stayDate:'2028-06-10'}]}, {days:[{...rule,stayDate:'2028-06-02'},{...rule,stayDate:'2028-06-02'}]},
  {days:[{...rule,stayDate:'2028-06-02',minStay:0}]},
  {weekdays:[{...rule,isoWeekday:8,priceDeltaBps:null}]},
  {weekdays:[{...rule,isoWeekday:1,nightlyMinor:'10',priceDeltaBps:100}]}
 ])('rejects invalid dates, duplicates or contradictory rules %#',change=>expect(()=>ratesEdit({...base,...change})).toThrow('INVALID_RATE_EDIT'));
});
