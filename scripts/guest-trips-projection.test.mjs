import {describe,it,expect} from 'vitest';
import {createRequire} from 'node:module';
const project=createRequire(import.meta.url)('../apps/api/ops/guest-trips-projection.cjs');
const trip={id:'00000000-0000-4000-8000-000000000001',confirmationCode:'SYNTHETIC',status:'confirmed',checkInAt:'2037-05-01T12:00:00Z',checkOutAt:'2037-05-03T12:00:00Z',currency:'UZS',totalMinor:'9007199254740993',property:{name:{ru:'Объект',en:'Property',private:'hidden'},city:'Tashkent',timezone:'Asia/Tashkent',lockCode:'private'}};
describe('guest trip response boundary',()=>{
 it('retains exact money while stripping new upstream private fields at every level',()=>{
  const result=project({trip:{...trip,guestDocument:'private',token:'private'}});
  expect(result.trip.totalMinor).toBe('9007199254740993');expect(JSON.stringify(result)).not.toMatch(/private|hidden|token|lockCode/);
 });
 it('rejects rounded money and unbounded or malformed pages',()=>{
  for(const bad of [{trip:{...trip,totalMinor:9007199254740992}},{items:Array(21).fill(trip),nextCursor:null},{items:[],nextCursor:'bad?url'},{items:[]}])expect(()=>project(bad)).toThrow();
 });
});
