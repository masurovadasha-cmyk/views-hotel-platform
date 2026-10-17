import {describe,it,expect} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {MarketReopen} from './MarketReopen';
import {MarketOrderCard} from './MarketOrderCard';
import type {MarketOrder} from './model';
const order:MarketOrder={orderId:'o',stage:'ready',revision:1,currency:'UZS',totalMinor:'100',requestedFor:'2026-10-13',lines:[]};
describe('reopen picking UI',()=>{
 it.each(['ru','uz','en'] as const)('requires explicit confirmation in %s',locale=>{
  const html=renderToStaticMarkup(<MarketReopen locale={locale} onAction={()=>{throw Error('unexpected submit');}}/>);
  expect(html).toContain('<button disabled=""');expect(html).toContain('type="checkbox"');expect(html).toContain('maxLength="500"');
 });
 it.each(['reserved','picking','ready','handed_over','completed'])('limits controls for stage %s',stage=>{
  for(const staff of [false,true]){
   const html=renderToStaticMarkup(<MarketOrderCard order={{...order,stage}} locale="en" staff={staff} disabled={false} onAction={()=>{}}/>);
   expect(html.includes('data-testid="market-reopen"')).toBe(staff&&['picking','ready'].includes(stage));
  }
 });
});
