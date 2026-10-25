import {beforeEach,describe,it,expect,vi} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {emptyDemoMarket,reduceDemoMarket,type DemoMarket} from './demo-market';
import {GuestMarket} from './GuestMarket';
import {useDemoMarket} from './useDemoMarket';
import {useGuestLocale} from './GuestLocale';
vi.mock('./useDemoMarket',()=>({useDemoMarket:vi.fn()}));
vi.mock('./GuestLocale',()=>({useGuestLocale:vi.fn()}));
const action=vi.fn();
function state(value:DemoMarket){vi.mocked(useDemoMarket).mockReturnValue({state:value,revision:1,blocked:false,loading:false,busy:false,conflict:false,error:'',raw:JSON.stringify(value),legacy:null,legacySources:[],act:action,resolveConflict:vi.fn()});}
beforeEach(()=>{vi.mocked(useGuestLocale).mockReturnValue({locale:'en',t:k=>k,setLocale:vi.fn()});state(emptyDemoMarket());action.mockClear();});
describe('separate demo market surfaces, shared ledger',()=>{
 it.each(['en','ru','uz'] as const)('offers three direct views without mutations in %s',locale=>{
  vi.mocked(useGuestLocale).mockReturnValue({locale,t:k=>k,setLocale:vi.fn()});
  for(const view of ['catalogue','basket','history'] as const){const html=renderToStaticMarkup(<GuestMarket view={view}/>);expect(html).toContain('market-nav-basket');expect(html).toContain(`data-view="${view}"`);expect(html.includes('data-product=')).toBe(view==='catalogue');expect(html.includes('data-testid="demo-market-history"')).toBe(view==='history');}
  expect(action).not.toHaveBeenCalled();
 });
 it('keeps pending review intact when navigating to catalogue/history and renders confirmation only in basket',()=>{
  const pending=reduceDemoMarket(reduceDemoMarket(emptyDemoMarket(),{type:'quantity',id:'sample-water',quantity:1}),{type:'prepare'});state(pending);
  const raw=JSON.stringify(pending);
  for(const view of ['catalogue','history','basket'] as const){const html=renderToStaticMarkup(<GuestMarket view={view}/>);expect(html.includes('data-testid="market-review"')).toBe(view==='basket');expect(html).toContain('Review pending');}
  expect(JSON.stringify(pending)).toBe(raw);expect(action).not.toHaveBeenCalled();
 });
 it('does not duplicate the editable cart in pending review',()=>{
  state(reduceDemoMarket(reduceDemoMarket(emptyDemoMarket(),{type:'quantity',id:'sample-water',quantity:1}),{type:'prepare'}));const html=renderToStaticMarkup(<GuestMarket view="basket"/>);expect(html).toContain('Confirm demo order');expect(html).toContain('Back to basket');expect(html).not.toContain('aria-label="Increase:');expect(html).not.toContain('data-product=');
 });
});
