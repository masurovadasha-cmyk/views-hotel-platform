import {describe,it,expect} from 'vitest';
import {designScreens,selectDesignScreens,designAsset} from './model';
describe('PDF design review is not workflow completion',()=>{
 it('keeps all 140 IDs and 280 unique pages with actual delivery status',()=>{
  expect(new Set(designScreens.map(s=>s.id)).size).toBe(140);
  expect(new Set(designScreens.flatMap(s=>Object.values(s.pages))).size).toBe(280);
  expect(designScreens.filter(s=>s.implementation==='pending').length).toBeGreaterThan(0);
  expect(designScreens.every(s=>s.visualAcceptance==='pending'&&s.publicCoreEnabled===false)).toBe(true);
 });
 it('filters by audience, ID and real status and refuses arbitrary asset paths',()=>{
  expect(selectDesignScreens('sg-la-005','guest','partial').map(s=>s.id)).toEqual(['SG-LA-005']);
  expect(selectDesignScreens('sg-la-005','partner','')).toEqual([]);
  expect(designAsset('SG-LA-005',true)).toContain('SG-LA-005-dark.webp');
  expect(()=>designAsset('../secret',false)).toThrow();
 });
});
