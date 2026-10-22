import {describe,it,expect} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {ReturnTimeline} from './ReturnTimeline';
import type {MarketReturn} from './model';
const value:MarketReturn={id:'r',serviceId:'s',quantity:1,status:'restocked',reason:'Returned',receivedAt:'2026-10-12T10:00:00Z',resolvedAt:'2026-10-12T10:05:00Z'};
describe('return timeline',()=>{
 it.each(['ru','uz','en'] as const)('renders both server timestamps with timezone in %s',locale=>{
  const html=renderToStaticMarkup(<ReturnTimeline value={value} locale={locale}/>);
  expect(html.match(/<time /g)).toHaveLength(2);
  expect(html).toContain('2026-10-12T10:05:00.000Z');expect(html).toContain('UTC');
 });
 it('does not invent inspection time for historical returns',()=>{
  const html=renderToStaticMarkup(<ReturnTimeline value={{...value,resolvedAt:null}} locale="en"/>);
  expect(html).toContain('Time not recorded');expect(html.match(/<time /g)).toHaveLength(1);
 });
 it('does not show an inspection completion for quarantine',()=>{
  const html=renderToStaticMarkup(<ReturnTimeline value={{...value,status:'quarantined',resolvedAt:null}} locale="en"/>);
  expect(html).not.toContain('Inspection completed');expect(html).not.toContain('Time not recorded');
 });
 it('handles missing or malformed legacy timestamps without crashing',()=>{
  const html=renderToStaticMarkup(<ReturnTimeline value={{...value,receivedAt:'bad',resolvedAt:undefined}} locale="en"/>);
  expect(html.match(/Time not recorded/g)).toHaveLength(2);
 });
});
