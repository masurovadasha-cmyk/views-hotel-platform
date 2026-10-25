import {describe,it,expect} from 'vitest';
import {readGuestRoute,guestRouteUrl} from './market-navigation';
describe('guest market navigation without ledger writes',()=>{
 it('roundtrips catalogue, basket and history and preserves unrelated runtime/date context',()=>{
  for(const marketView of ['catalogue','basket','history'] as const){const u=guestRouteUrl('https://example.invalid/app/?api=demo&language=uz#stay',{tab:'market',marketView});expect(readGuestRoute(u.search)).toEqual({tab:'market',marketView});expect(u.searchParams.get('language')).toBe('uz');expect(u.hash).toBe('#stay');}
 });
 it('does not change explicit runtime mode or infer a demo route in live guest',()=>{
  const u=guestRouteUrl('https://example.invalid/?api=live',{tab:'market',marketView:'basket'});expect(u.searchParams.get('api')).toBe('live');expect(readGuestRoute(u.search,true).tab).toBe('explore');
 });
 it('supports a refreshable static demo link while clearing market view on other guest tabs',()=>{
  const u=guestRouteUrl('https://example.invalid/?guestTab=market&marketView=basket',{tab:'services',marketView:'catalogue'});expect(u.searchParams.get('api')).toBe('demo');expect(u.searchParams.has('marketView')).toBe(false);expect(readGuestRoute(u.search).tab).toBe('services');
 });
 it('rejects unknown routes as navigation only, without restoring fabricated order state',()=>{
  expect(readGuestRoute('?guestTab=constructor&marketView=confirm&order=DEMO-999')).toEqual({tab:'explore',marketView:'catalogue'});
 });
});
