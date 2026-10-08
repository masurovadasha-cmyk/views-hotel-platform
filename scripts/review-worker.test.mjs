import {describe,it,expect,vi} from 'vitest';
import worker from '../workers/review';
describe('public review Worker',()=>{
 it('refuses every API path without passing credentials to assets or pretending login',async()=>{
  const fetch=vi.fn();for(const path of ['/api/auth-email','/api/session','/local-api/login','/v1/refund-reconciliation']){
   const response=await worker.fetch(new Request('https://views.test'+path,{method:'POST',body:'private@example.invalid'}),{ASSETS:{fetch}});
   expect(response.status).toBe(503);expect(await response.json()).toMatchObject({emailConnected:false,realPayments:false});
  }expect(fetch).not.toHaveBeenCalled();
 });
 it('serves assets with security headers and uncached release identity',async()=>{
  const fetch=vi.fn(async()=>new Response('{"version":"fixture"}'));
  const result=await worker.fetch(new Request('https://views.test/release.json'),{ASSETS:{fetch}});
  expect(result.status).toBe(200);expect(result.headers.get('Cache-Control')).toBe('no-store');
  expect(result.headers.get('Content-Security-Policy')).toContain("frame-ancestors 'none'");
  expect((await worker.fetch(new Request('https://views.test/',{method:'POST'}),{ASSETS:{fetch}})).status).toBe(405);
  expect(fetch).toHaveBeenCalledTimes(1);
 });
});
