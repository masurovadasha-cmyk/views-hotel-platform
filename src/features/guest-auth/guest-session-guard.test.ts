import {describe,it,expect} from 'vitest';
import type {GuestSession} from '../../api/guest-email';
import {expireMatchingGuestSession} from './guest-session-guard';
const session=(userId:string,csrf:string):Extract<GuestSession,{authenticated:true}>=>({
 authenticated:true,profile:{userId,email:'synthetic@views.invalid',locale:'en',expiresAt:'2099-01-01T00:00:00Z',role:'guest'},csrf,
});
describe('late trip authorization failures',()=>{
 it('expires the session that made the failed request',()=>{
  expect(expireMatchingGuestSession(session('a','old'),session('a','old'))).toEqual({authenticated:false});
 });
 it('preserves a later session for the same user or a different account',()=>{
  for(const current of [session('a','new'),session('b','old')])
   expect(expireMatchingGuestSession(current,session('a','old'))).toBe(current);
 });
 it('does not re-create a signed-out or loading session',()=>{
  for(const current of [null,{authenticated:false} as const])
   expect(expireMatchingGuestSession(current,session('a','old'))).toBe(current);
 });
});
