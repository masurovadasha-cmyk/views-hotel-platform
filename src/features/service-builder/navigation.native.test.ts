import {afterEach,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {allowDraftNavigation,registerDraftNavigationGuard} from './navigation';
const script=JSON.parse(readFileSync('apps/android-review/src/uz/views/review/NativeBackGate.java','utf8').match(/SCRIPT = ("[^\n]+");/)![1]);
const cleanup:Array<()=>void>=[];afterEach(()=>cleanup.splice(0).forEach(fn=>fn()));
const evaluate=(window:Record<string,unknown>)=>runInNewContext(script,{window});
it('uses normal Back without a registered callback and requires an exact boolean when present',()=>{
 expect(evaluate({})).toBe(true);
 for(const result of [false,null,undefined,1,'true',{},Promise.resolve(true)])expect(evaluate({__viewsAllowNativeBack:()=>result})).toBe(false);
 for(const value of [null,true,'true',{}])expect(evaluate({__viewsAllowNativeBack:value})).toBe(false);
 expect(evaluate({__viewsAllowNativeBack:()=>{throw Error('unavailable');}})).toBe(false);
});
it('keeps unsaved or pending input mounted until accepted; saved/no guard allows Back',()=>{
 let dirty=true,pending=false,confirm=false,inputs='unsaved';
 cleanup.push(registerDraftNavigationGuard(()=>!pending&&(!dirty||confirm)));
 const window={__viewsAllowNativeBack:allowDraftNavigation};
 expect(evaluate(window)).toBe(false);expect(inputs).toBe('unsaved');
 confirm=true;pending=true;expect(evaluate(window)).toBe(false);
 pending=false;expect(evaluate(window)).toBe(true);
 confirm=false;dirty=false;expect(evaluate(window)).toBe(true);expect(inputs).toBe('unsaved');
});
it('fails closed when a registered guard throws or violates its boolean contract',()=>{
 const remove=registerDraftNavigationGuard(()=>{throw Error('failure');});expect(allowDraftNavigation()).toBe(false);remove();
 cleanup.push(registerDraftNavigationGuard((()=> 'true') as unknown as ()=>boolean));expect(allowDraftNavigation()).toBe(false);
});
