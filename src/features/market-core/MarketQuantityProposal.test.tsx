import {describe,it,expect} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {MarketQuantityProposal} from './MarketQuantityProposal';
import type {MarketOrder} from './model';
const order:MarketOrder={orderId:'o',stage:'reserved',revision:1,currency:'UZS',totalMinor:'200',requestedFor:'2026-10-13',lines:[{serviceId:'s',name:{ru:'Вода',en:'Water',uz:'Suv'},quantity:2,priceMinor:'100'}]};
describe('quantity reduction form',()=>{
 it.each(['ru','en','uz'] as const)('requires an explicit selection before submitting in %s',locale=>{
  const html=renderToStaticMarkup(<MarketQuantityProposal order={order} locale={locale} onAction={()=>{throw Error('render must not submit');}}/>);
  expect(html).toContain('data-testid="quantity-proposal"');expect(html).toContain('<button disabled=""');expect(html).toContain('maxLength="500"');
 });
 it('does not propose reducing a single unit to zero',()=>{
  expect(renderToStaticMarkup(<MarketQuantityProposal order={{...order,lines:[{...order.lines[0],quantity:1}]}} locale="en" onAction={()=>{}}/>)).toBe('');
 });
});
