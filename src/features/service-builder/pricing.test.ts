import {describe,it,expect} from 'vitest';
import {maxMinor,validatePricing,simulatePricing} from './pricing';
const rule=(unitMinor='125')=>({kind:'unit',currency:'UZS',unitMinor});
describe('unpublished price arithmetic',()=>{
 it('uses exact minor units, not floating point or approved billing',()=>{
  expect(simulatePricing(rule(),'3')).toEqual({simulationOnly:true,approved:false,currency:'UZS',unitMinor:'125',quantity:3,totalMinor:'375'});
  expect(simulatePricing(rule('9007199254740993'),'2').totalMinor).toBe('18014398509481986');
  expect(simulatePricing(rule('0'),'50').totalMinor).toBe('0');
  expect(simulatePricing(rule(maxMinor),'1').totalMinor).toBe(maxMinor);
  expect(()=>simulatePricing(rule(maxMinor),'2')).toThrow('limit');
 });
 it('rejects unsupported rules and noncanonical, negative, decimal and overflowing amounts',()=>{
  expect(validatePricing(null)).toBeNull();
  for(const value of ['', '01','-1','+1','1.5','1e2',' 1','1 ', '9223372036854775808','9'.repeat(100)])expect(()=>validatePricing(rule(value))).toThrow('invalid');
  for(const value of [undefined,{}, {...rule(),currency:'USD'},{...rule(),kind:'fixed'},{...rule(),tax:1},{...rule(),unitMinor:125}])expect(()=>validatePricing(value)).toThrow('invalid');
  const original=rule();expect(validatePricing(original)).not.toBe(original);
 });
 it('bounds ephemeral sample quantity without coercion and refuses an unconfigured rule',()=>{
  for(const value of [0,1,NaN,'0','01','51','-1','1.5','1e1',' 1',''])expect(()=>simulatePricing(rule(),value)).toThrow('invalid');
  expect(()=>simulatePricing(null,'1')).toThrow('invalid');
  expect(simulatePricing(rule(),'50').quantity).toBe(50);
 });
});
