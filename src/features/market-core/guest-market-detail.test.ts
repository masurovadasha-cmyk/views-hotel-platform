import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it} from 'vitest';
import {GuestMarketDetail,parseMarketDetail} from './GuestMarketDetail';
const id='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002';
const line={serviceId:id,name:{en:'Water',ru:'Вода',uz:'Suv'},quantity:2,priceMinor:'9007199254740993'};
const raw={stage:'completed',currency:'UZS',totalMinor:'18014398509481986',lines:[line],creditedMinor:'9007199254740993',credits:[{id:other,amountMinor:'9007199254740993',reason:'Adjustment'}]};
describe('guest market read-only detail',()=>{
 it('preserves exact bigint values and discards unrelated data',()=>{
  const parsed=parseMarketDetail({...raw,staffSecret:'hidden',lines:[{...line,privateNote:'hidden'}]});
  expect(parsed.totalMinor).toBe('18014398509481986');expect(parsed.creditedMinor).toBe('9007199254740993');expect(JSON.stringify(parsed)).not.toContain('hidden');
  const html=renderToStaticMarkup(createElement(GuestMarketDetail,{order:parsed,locale:'en'}));
  expect(html).toContain('90,071,992,547,409.93 UZS');expect(html).toContain('180,143,985,094,819.86 UZS');expect(html).toContain('Charge after credits');expect(html).not.toMatch(/<(button|input|a)\b/);
 });
 it.each([{totalMinor:'18014398509481985'},{creditedMinor:'18014398509481987'},{currency:'XYZ'},
  {lines:[{...line,priceMinor:'9223372036854775807'}]},{lines:[{...line,quantity:1.5}]},{lines:[{...line,quantity:51}]},
  {lines:[line,line]},{lines:[{...line,priceMinor:'01'}]},{credits:[{id:other,amountMinor:'9007199254740994',reason:'too much'}]},
  {stage:'reserved'},{issue:{status:'unknown',note:'hello'}},{issue:{status:'open',note:'x'.repeat(1001)}},{replacesOrderId:'bad'}
 ])('rejects invalid or inconsistent detail %j',override=>expect(()=>parseMarketDetail({...raw,...override})).toThrow('INVALID_MARKET_DETAIL'));
 it('does not invent a folio balance from missing credit data',()=>{
  const parsed=parseMarketDetail({...raw,stage:'reserved',creditedMinor:undefined,credits:undefined});
  const html=renderToStaticMarkup(createElement(GuestMarketDetail,{order:parsed,locale:'en'}));expect(html).not.toContain('Charge after credits');expect(parsed.creditedMinor).toBeNull();
 });
 it('allows latest-credit subtotal below the explicit cumulative total',()=>{
  expect(parseMarketDetail({...raw,credits:[]})).toMatchObject({creditedMinor:raw.creditedMinor,credits:[]});
 });
 it.each(['en','ru','uz'] as const)('renders issue and related IDs safely in %s',locale=>{
  const parsed=parseMarketDetail({...raw,issue:{status:'answered',note:'<script>note</script>',answer:'<b>answer</b>'},replacesOrderId:id,replacedByOrderId:other});
  const html=renderToStaticMarkup(createElement(GuestMarketDetail,{order:parsed,locale}));
  expect(html).toContain('&lt;script&gt;note&lt;/script&gt;');expect(html).toContain('&lt;b&gt;answer&lt;/b&gt;');expect(html).toContain(id);expect(html).toContain(other);expect(html).not.toContain('href=');
 });
});
