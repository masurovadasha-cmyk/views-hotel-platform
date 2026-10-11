import {describe,it,expect,vi,afterEach} from 'vitest';
import {execFileSync} from 'node:child_process';
import {guestTrips} from './guest-trips';
const trip={id:'trip-1',confirmationCode:'TEST',status:'confirmed',checkInAt:'2037-05-01T12:00:00Z',checkOutAt:'2037-05-03T12:00:00Z',currency:'UZS',totalMinor:'9007199254740993',property:{name:{ru:'Тест'},city:'Tashkent',timezone:'Asia/Tashkent'}};
afterEach(()=>vi.unstubAllGlobals());
describe('guest trips generated contract',()=>{
 it('has no generated drift',()=>{expect(()=>execFileSync(process.execPath,['scripts/generate-guest-trips.mjs','--check'])).not.toThrow();});
 it('preserves transport security, cursor encoding and exact money',async()=>{
  const fetch=vi.fn().mockResolvedValue({ok:true,json:async()=>({items:[trip],nextCursor:null})});vi.stubGlobal('fetch',fetch);
  expect((await guestTrips.list('a/b')).items[0].totalMinor).toBe('9007199254740993');
  expect(fetch).toHaveBeenCalledWith('/guest-api/trips?cursor=a%2Fb',expect.objectContaining({credentials:'same-origin',cache:'no-store',redirect:'error',method:'GET'}));
 });
 it('keeps runtime validation and session errors',async()=>{
  const fetch=vi.fn().mockResolvedValueOnce({ok:true,json:async()=>({items:[{...trip,totalMinor:42}],nextCursor:null})})
   .mockResolvedValueOnce({ok:false,json:async()=>({error:'GUEST_EMAIL_SESSION_INVALID'})});vi.stubGlobal('fetch',fetch);
  await expect(guestTrips.list()).rejects.toThrow('GUEST_CORE_UNAVAILABLE');
  await expect(guestTrips.detail('trip-1')).rejects.toThrow('GUEST_EMAIL_SESSION_INVALID');
 });
});
