import {describe,it,expect,vi} from 'vitest';
import {availabilityZones,checkAvailability,validateAvailability,parseWindowTime,windowTime,type Availability} from './availability';
import {messages,translate} from './messages';
const rule=(timezone='UTC',day=1,startMinute=540,endMinute=1020):Availability=>({kind:'weekly',timezone,windows:[{day,startMinute,endMinute}]});
describe('unpublished availability calendar',()=>{
 it('uses exact local start-inclusive end-exclusive membership with no operational promise',()=>{
  for(const [time,status] of [['08:59','outside'],['09:00','inside'],['16:59','inside'],['17:00','outside']])expect(checkAvailability(rule(),'2026-10-26T'+time)).toEqual({simulationOnly:true,approved:false,status,timezone:'UTC',sampleLocal:'2026-10-26T'+time,instant:'2026-10-26T'+time+':00.000Z'});
  expect(checkAvailability(rule(),'2026-10-27T10:00').status).toBe('outside');
  expect(checkAvailability(rule('UTC',7,0,1440),'2026-10-25T23:59').status).toBe('inside');
  expect(checkAvailability(rule('UTC',7,0,1440),'2026-10-26T00:00').status).toBe('outside');
  expect(checkAvailability(rule('Asia/Tashkent',1,0,1440),'2026-10-26T00:00').instant).toBe('2026-10-25T19:00:00.000Z');
  expect(checkAvailability(rule('UTC',2,0,1440),'2028-02-29T10:00').status).toBe('inside');
  expect(checkAvailability(rule('UTC',4,0,1440),'2099-12-31T23:59').status).toBe('inside');
  expect(()=>checkAvailability(null,'2026-10-26T09:00')).toThrow('unconfigured');
 });
 it('rejects malformed dates, suffixes, seconds and timezone coercion',()=>{
  for(const sample of ['',null,1,'2026-02-29T09:00','2026-04-31T09:00','2026-10-26T24:00','2026-10-26T09:60','2026-10-26T09:00Z','2026-10-26T09:00:00','2026-10-26T09:00+00:00',' 2026-10-26T09:00','2026-10-26T09:00 ','1999-12-31T09:00','2100-01-01T09:00'])expect(()=>checkAvailability(rule(),sample)).toThrow('time');
  for(const sample of ['','9:00','24:00','12:60','09:00Z',' 09:00','09:00 ','09:00junk'])expect(parseWindowTime(sample)).toBe(-1);
  expect(parseWindowTime('24:00',true)).toBe(1440);expect(parseWindowTime('00:00')).toBe(0);expect(windowTime(1440)).toBe('24:00');expect(windowTime(-1)).toBe('');
 });
 it('rejects actual DST gaps/folds, including window endpoints, without shift',()=>{
  for(const [zone,gap,fold] of [['America/New_York','2026-03-08T02:30','2026-11-01T01:30'],['Europe/Berlin','2026-03-29T02:30','2026-10-25T02:30']]){expect(()=>checkAvailability(rule(zone,7,0,1440),gap)).toThrow('nonexistent');expect(()=>checkAvailability(rule(zone,7,0,1440),fold)).toThrow('ambiguous');}
  expect(checkAvailability(rule('America/New_York',7,0,1440),'2026-03-08T03:30').instant).toBe('2026-03-08T07:30:00.000Z');
  expect(()=>checkAvailability(rule('America/New_York',7,150,240),'2026-03-08T03:30')).toThrow('nonexistent');
  expect(()=>checkAvailability(rule('America/New_York',7,90,240),'2026-11-01T03:30')).toThrow('ambiguous');
 });
 it('strictly validates bounded windows and copies all mutable data',()=>{
  const original=rule(),copy=validateAvailability(original)!;copy.windows[0].day=2;expect(original.windows[0].day).toBe(1);
  expect(validateAvailability(null)).toBeNull();
  const adjacent={...rule(),windows:[{day:1,startMinute:540,endMinute:600},{day:1,startMinute:600,endMinute:660}]};expect(validateAvailability(adjacent)).toEqual(adjacent);
  for(const change of [{day:0},{day:8},{day:1.5},{day:'1'},{startMinute:NaN},{startMinute:-1},{endMinute:1441},{startMinute:1020},{startMinute:1200},{extra:true}])expect(()=>validateAvailability({...rule(),windows:[{...rule().windows[0],...change}]})).toThrow('invalid');
  for(const bad of [undefined,{}, {...rule(),timezone:''},{...rule(),timezone:'Mars/Example'},{...rule(),kind:'always'}, {...rule(),extra:true},{...rule(),windows:[]},{...rule(),windows:Array(15).fill(rule().windows[0])},{...adjacent,windows:[adjacent.windows[0],{day:1,startMinute:599,endMinute:660}]}])expect(()=>validateAvailability(bad)).toThrow('invalid');
  expect(availabilityZones.length).toBe(4);
 });
 it('fails closed when Intl cannot guarantee timezone conversion',()=>{
  const original=Intl.DateTimeFormat;try{vi.spyOn(Intl,'DateTimeFormat').mockImplementation(function(){throw Error('unsupported');} as typeof Intl.DateTimeFormat);expect(()=>checkAvailability(rule(),'2026-10-26T09:00')).toThrow('timezone');}finally{vi.restoreAllMocks();}
  expect(Intl.DateTimeFormat).toBe(original);
 });
 it('rejects ignored timezone/hourCycle and missing formatToParts',()=>{
  for(const resolved of [{timeZone:'UTC',hourCycle:'h23'},{timeZone:'Asia/Tashkent',hourCycle:'h24'}]){try{vi.spyOn(Intl,'DateTimeFormat').mockImplementation(function(){return {resolvedOptions:()=>resolved,formatToParts:()=>[]};} as unknown as typeof Intl.DateTimeFormat);expect(()=>checkAvailability(rule('Asia/Tashkent'),'2026-10-26T09:00')).toThrow('timezone');}finally{vi.restoreAllMocks();}}
  try{vi.spyOn(Intl,'DateTimeFormat').mockImplementation(function(){return {resolvedOptions:()=>({timeZone:'UTC',hourCycle:'h23'})};} as unknown as typeof Intl.DateTimeFormat);expect(()=>checkAvailability(rule(),'2026-10-26T09:00')).toThrow('timezone');}finally{vi.restoreAllMocks();}
 });
 it('provides all introduced text in RU/UZ/EN',()=>{
  for(const key of ['Unpublished weekly hours','Calendar check only, not service availability, capacity, a booking or an order promise. No publication or activation.','No draft hours configured.','Inside configured draft hours','Outside configured draft hours','This device cannot safely resolve the selected timezone.','Monday','Sunday']){expect(messages[key]).toHaveLength(2);expect(translate('en',key)).toBe(key);expect(translate('ru',key)).not.toBe(key);expect(translate('uz',key)).not.toBe(key);}
 });
});
