import {it,expect} from 'vitest';
import {allowDraftNavigation,registerDraftNavigationGuard} from './navigation';
it('blocks departure until the mounted editor accepts, and removes its guard on cleanup',()=>{
 expect(allowDraftNavigation()).toBe(true);let accepted=false;
 const remove=registerDraftNavigationGuard(()=>accepted);
 expect(allowDraftNavigation()).toBe(false);accepted=true;expect(allowDraftNavigation()).toBe(true);
 accepted=false;remove();expect(allowDraftNavigation()).toBe(true);
});
