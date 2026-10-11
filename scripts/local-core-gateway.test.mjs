import {describe,it,expect} from 'vitest';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {validateStay,requireSameOrigin}=require('../apps/api/ops/local-core-gateway.cjs');
const fixture={propertyId:'74240000-0000-4000-8000-000000000002',units:[{unitId:'74240000-0000-4000-8000-000000000007',ratePlanId:'74240000-0000-4000-8000-000000000009',maxGuests:2}]};
const day=n=>new Date(Date.now()+5*3600000+n*86400000).toISOString().slice(0,10);
const input=()=>({unitId:fixture.units[0].unitId,ratePlanId:fixture.units[0].ratePlanId,checkIn:day(2),checkOut:day(4),guests:1});
const req=()=>({headers:{host:'127.0.0.1:4173','x-views-local-workspace':'1',origin:'http://127.0.0.1:4173','sec-fetch-site':'same-origin'},socket:{remoteAddress:'127.0.0.1'}});
describe('local Core gateway boundary',()=>{
 it('binds dates, property and rate; caller cannot provide price',()=>{const out=validateStay(input(),fixture);expect(out.propertyId).toBe(fixture.propertyId);expect(out.checkInAt).toBe(day(2)+'T14:00:00+05:00');expect(out.guests).toEqual([{age:18,residency:'resident'}]);expect(out).not.toHaveProperty('amount');});
 for(const patch of [{unitId:'foreign'},{ratePlanId:'foreign'},{organizationId:'foreign'},{totalMinor:'1'},{guests:0},{guests:3},{guests:'1'},{checkIn:'2027-02-30'},{checkOut:day(1)},{checkIn:day(-1)},{checkOut:day(60)}])
   it('rejects untrusted input '+JSON.stringify(patch),()=>expect(()=>validateStay({...input(),...patch},fixture)).toThrow());
 it('allows explicit same-origin local POST',()=>expect(()=>requireSameOrigin(req(),true)).not.toThrow());
 for(const [header,value] of [['host','evil.example'],['origin','null'],['origin','https://evil.example'],['sec-fetch-site','cross-site'],['sec-fetch-site','same-site'],['x-views-local-workspace','0'],['x-organization-id','forged'],['x-views-internal-key','forged']])
   it('rejects unsafe browser header '+header+':'+value,()=>{const r=req();r.headers[header]=value;expect(()=>requireSameOrigin(r,true)).toThrow();});
 it('rejects missing origin on mutations',()=>{const r=req();delete r.headers.origin;expect(()=>requireSameOrigin(r,true)).toThrow('ORIGIN_REQUIRED');});
 it('rejects nonloopback client even with trusted Host',()=>{const r=req();r.socket.remoteAddress='192.168.1.4';expect(()=>requireSameOrigin(r,true)).toThrow('LOCAL_ONLY');});
});
