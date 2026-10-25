import {afterEach,describe,it,expect,vi} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {GuestApp} from './GuestApp';
import {useDemoMarket} from './useDemoMarket';
vi.mock('./useDemoMarket',()=>({useDemoMarket:vi.fn(()=>{throw Error('LIVE_MUST_NOT_READ_DEMO_STORAGE');})}));
afterEach(()=>vi.unstubAllGlobals());
describe('live guest market storage boundary',()=>{
 it('ignores demo-market navigation hints without mounting or reading demo state',()=>{
  vi.stubGlobal('location',{search:'?api=live&guestTab=market&marketView=basket'});
  const html=renderToStaticMarkup(<GuestApp live/>);
  expect(html).not.toContain('data-testid="guest-market"');expect(html).not.toContain('guest-basket-shortcut');expect(useDemoMarket).not.toHaveBeenCalled();
 });
});
