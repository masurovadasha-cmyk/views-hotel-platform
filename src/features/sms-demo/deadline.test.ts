import {describe,it,expect} from 'vitest';
import {deadlineState} from './deadline';
describe('quote deadline',()=>{
 const end='2037-10-01T10:00:00Z',now=Date.parse(end);
 it('rounds remaining seconds up',()=>expect(deadlineState(end,now-1001,false)).toEqual({seconds:2,canSubmit:true}));
 it('blocks a new request exactly at expiry',()=>expect(deadlineState(end,now,false)).toEqual({seconds:0,canSubmit:false}));
 it('allows reconciliation of an already sent request after expiry',()=>expect(deadlineState(end,now+1,true)).toEqual({seconds:0,canSubmit:true}));
 it('fails closed on invalid clock or deadline',()=>{expect(deadlineState('invalid',now,false).canSubmit).toBe(false);expect(deadlineState(end,NaN,false).canSubmit).toBe(false);});
 it('keeps reconciliation available for unknown deadlines',()=>expect(deadlineState('invalid',now,true).canSubmit).toBe(true));
});
