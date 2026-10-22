import {describe,it,expect} from 'vitest';
import {conciergeQueueRoute} from './queue';
import {conciergeText} from './locale';
describe('server concierge queue requests',()=>{
 it('selects a dedicated overdue endpoint and retains its cursor for later pages',()=>{
  const cursor='10000000-0000-4000-8000-000000000001';
  expect(conciergeQueueRoute(false)).toBe('service-orders/concierge');
  expect(conciergeQueueRoute(true)).toBe('service-orders/concierge/overdue');
  expect(conciergeQueueRoute(true,cursor)).toBe('service-orders/concierge/overdue?cursor='+cursor);
  expect(conciergeQueueRoute(false,cursor)).toBe('service-orders/concierge?cursor='+cursor);
 });
 it('rejects forged cursors that could inject another queue or request path',()=>{
  for(const cursor of ['','../actions','x&propertyId=other','?cursor=x'])expect(()=>conciergeQueueRoute(true,cursor)).toThrow('INVALID_CURSOR');
 });
 it('labels the queue and its manual-only behavior in every supported language',()=>{
  for(const locale of ['en','ru','uz'] as const)for(const key of ['queueLabel','queueAll','queueOverdue','queueEmpty','queueHint'])expect(conciergeText(locale,key)).not.toBe(key);
 });
});
