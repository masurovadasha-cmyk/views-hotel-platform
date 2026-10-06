import {describe,it,expect,vi,afterEach} from 'vitest';
import {readStaffInvitationLink,consumeStaffInvitationLink} from './staff-invitation-link';
const base='http://127.0.0.1:4173/?api=local-core',token='a'.repeat(64);
afterEach(()=>vi.unstubAllGlobals());
describe('staff invitation links',()=>{
 it('accepts only fixed action and token in a fragment',()=>expect(readStaffInvitationLink(base+'#staff-action=activate&token='+token)).toEqual({mode:'activate',token}));
 it('does not use secrets from query strings',()=>expect(readStaffInvitationLink(base+'&token='+token)).toBeNull());
 it('rejects duplicated, extra and unknown parameters',()=>{
   for(const hash of ['staff-action=admin&token='+token,'staff-action=activate&token='+token+'&role=admin','staff-action=reset&token='+token+'&token='+token,'staff-action=reset&token=short'])expect(readStaffInvitationLink(base+'#'+hash)).toBeNull();
 });
 it('does not activate the public/demo runtime or another route',()=>{
  expect(readStaffInvitationLink('https://example.com/?api=demo#staff-action=activate&token='+token)).toBeNull();
  expect(readStaffInvitationLink('http://127.0.0.1:4173/other?api=local-core#staff-action=activate&token='+token)).toBeNull();
 });
 it('removes encoded secret parameter names from browser history',()=>{
  const url=new URL(base+'#staff%2Daction=activate&%74oken='+token),replaceState=vi.fn();
  vi.stubGlobal('window',{location:url,history:{state:null,replaceState}});
  expect(consumeStaffInvitationLink()).toEqual({mode:'activate',token});
  expect(replaceState).toHaveBeenCalledWith(null,'','/?api=local-core');
 });
});
