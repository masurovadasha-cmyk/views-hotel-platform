import {describe,expect,it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {createElement} from 'react';
import {GuestCleaningDetail,parseCleaningDetail} from './GuestCleaningDetail';
const source={revision:3,requestedFor:'2026-10-18T18:30:00+05:00',feedback:{rating:4,comment:'Thank you'}};
describe('guest cleaning detail projection',()=>{
 it('normalizes the requested instant and only returns guest-safe fields',()=>{
  expect(parseCleaningDetail({...source,assignedMembershipId:'private-staff',unitId:'private-unit',completionNote:{private:true},inspectionNote:'private-note',feedback:{...source.feedback,moderationNote:'private-review'}})).toEqual({revision:3,requestedFor:'2026-10-18T13:30:00.000Z',feedback:source.feedback});
 });
 it.each([undefined,null,0,-1,1.5,'3',NaN,Infinity,Number.MAX_SAFE_INTEGER+1])('rejects unsafe revision %s',revision=>expect(()=>parseCleaningDetail({...source,revision})).toThrow('GUEST_CLEANING_DETAIL_INVALID'));
 it.each([undefined,null])('accepts absent feedback (%s) without inventing a review',feedback=>expect(parseCleaningDetail({...source,feedback}).feedback).toBeNull());
 it.each([null,[],{}, {...source,requestedFor:'2026-13-18T18:30:00Z'},{...source,requestedFor:'2026-10-18T18:30:00'},{...source,requestedFor:42},{...source,requestedFor:'x'.repeat(50)}])('rejects an invalid date or root: %j',raw=>expect(()=>parseCleaningDetail(raw)).toThrow('GUEST_CLEANING_DETAIL_INVALID'));
 it.each([[],{rating:0,comment:''},{rating:6,comment:''},{rating:1.5,comment:''},{rating:'5',comment:''},{rating:5,comment:42},{rating:5,comment:'x'.repeat(501)},{rating:5,comment:'a\u0000b'}])('rejects malformed feedback: %j',feedback=>expect(()=>parseCleaningDetail({...source,feedback})).toThrow('GUEST_CLEANING_DETAIL_INVALID'));
 it('keeps valid rating boundaries and bounded empty comments',()=>{
  for(const rating of [1,5])expect(parseCleaningDetail({...source,feedback:{rating,comment:''}}).feedback).toEqual({rating,comment:''});
  expect(parseCleaningDetail({...source,feedback:{rating:5,comment:'x'.repeat(500)}}).feedback?.comment).toHaveLength(500);
 });
 it.each([['ru','Запрошенное время'],['uz','So‘ralgan vaqt'],['en','Requested time']] as const)('renders read-only requested time and escaped feedback in %s',(locale,label)=>{
  const html=renderToStaticMarkup(createElement(GuestCleaningDetail,{locale,order:parseCleaningDetail({...source,feedback:{rating:5,comment:'<script>unsafe</script>'},completionNote:'private-secret'})}));
  expect(html).toContain(label);expect(html).toContain('5 / 5');expect(html).toContain('&lt;script&gt;');expect(html).toContain('dateTime="2026-10-18T13:30:00.000Z"');
  expect(html).not.toMatch(/private-secret|<script>|<button|<input|<form/);
 });
});
