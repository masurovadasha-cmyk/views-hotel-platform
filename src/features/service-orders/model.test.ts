import {describe,it,expect} from 'vitest';
import {retryable} from './model';
import {cleaningText} from './locale';
describe('cleaning retry and translations',()=>{
 it('retains the same command on uncertain transport but allows reloading rejected terms',()=>{
  for(const code of ['CORE_UNAVAILABLE','GUEST_CORE_UNAVAILABLE','SERVICE_OPERATION_FAILED'])expect(retryable(code)).toBe(true);
  for(const code of ['SERVICE_PRICE_CHANGED','SERVICE_ASSIGNEE_BUSY','SERVICE_SELF_INSPECTION_FORBIDDEN','SERVICE_REVISION_CHANGED','FOLIO_NOT_OPEN','GUEST_CSRF_REJECTED'])expect(retryable(code)).toBe(false);
 });
 it('translates every order stage and material financial consent in all three languages',()=>{
  for(const key of ['requested','assigned','working','inspection','rework','done','cancelled','terms','accept','uncertain'])for(const locale of ['ru','uz','en'] as const)expect(cleaningText(locale,key)).not.toBe(key);
 });
});
