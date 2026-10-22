import {describe,it,expect,vi} from 'vitest';
import {consumeGuestEmailLink} from './guest-email-link';
const challengeId='00000000-0000-4000-8000-000000000001',token='vgel_'+'a'.repeat(43);
describe('guest email link boundary',()=>{
 it('consumes only a complete fragment and removes it before returning credentials',()=>{
  const replace=vi.fn();expect(consumeGuestEmailLink(`http://127.0.0.1:4174/?api=guest-core#challengeId=${challengeId}&token=${token}`,replace))
   .toEqual({link:{challengeId,token},invalid:false});expect(replace).toHaveBeenCalledWith('/?api=guest-core');
 });
 it('removes malformed, repeated and extra parameters without accepting them',()=>{
  for(const hash of [`challengeId=${challengeId}`,`token=vgel_bad`,`challengeId=bad&token=${token}`,
   `challengeId=${challengeId}&token=${token}&token=${token}`,`challengeId=${challengeId}&token=${token}&role=admin`]){
   const replace=vi.fn();expect(consumeGuestEmailLink('https://example.invalid/#'+hash,replace)).toEqual({link:null,invalid:true});expect(replace).toHaveBeenCalledOnce();
  }
 });
 it('preserves staff invitations and unrelated anchors',()=>{
  for(const hash of ['token=staff-token&mode=activate','section','']){
   const replace=vi.fn();expect(consumeGuestEmailLink('https://example.invalid/#'+hash,replace)).toEqual({link:null,invalid:false});expect(replace).not.toHaveBeenCalled();
  }
 });
 it('does not accept query-string credentials as an email link',()=>{
  expect(consumeGuestEmailLink(`https://example.invalid/?challengeId=${challengeId}&token=${token}`,vi.fn()).link).toBeNull();
 });
});
