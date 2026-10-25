import {describe,it,expect} from 'vitest';
import {ownerServicesText} from './locale';
describe('owner services honest read-only scope',()=>{
 it.each(['ru','uz','en'] as const)('provides distinct localized labels and explicitly limited history in %s',locale=>{
  for(const key of ['title','scope','property','catalog','orders','refresh','next','back','loading','empty','error','choose','requested','accepted','in_progress','quantity'] as const)expect(ownerServicesText(locale,key).length).toBeGreaterThan(0);
  expect(ownerServicesText(locale,'catalog')).toContain('UZS');
  expect(ownerServicesText(locale,'scope')).not.toEqual(ownerServicesText(locale==='en'?'ru':'en','scope'));
 });
});
