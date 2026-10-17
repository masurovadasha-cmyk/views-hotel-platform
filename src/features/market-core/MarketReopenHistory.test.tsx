import {describe,it,expect} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {MarketReopenHistory} from './MarketReopenHistory';
import type {MarketOrder} from './model';
const order:MarketOrder={orderId:'o',stage:'reserved',revision:1,currency:'UZS',totalMinor:'100',requestedFor:'2026-10-13',lines:[],reopenCount:22,reopenHistory:[{at:'2026-10-13T18:00:00Z',note:'<script>unsafe</script>'}]};
describe('public reopening history',()=>{
 it.each(['ru','uz','en'] as const)('shows server time, count and escaped reason in %s',locale=>{
  const html=renderToStaticMarkup(<MarketReopenHistory order={order} locale={locale}/>);
  expect(html).toContain('2026-10-13T18:00:00Z');expect(html).toContain('UTC');expect(html).toContain('22');expect(html).not.toContain('<script>');expect(html).toContain('&lt;script&gt;');
 });
 it('does not invent history for old receipts',()=>{
  expect(renderToStaticMarkup(<MarketReopenHistory order={{...order,reopenHistory:undefined}} locale="en"/>)).toBe('');
 });
});
