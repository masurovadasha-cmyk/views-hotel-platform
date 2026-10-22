import {describe,it,expect} from 'vitest';
import {knowledgePage,preferenceState,guestContext} from './support-model';
const id='10000000-0000-4000-8000-000000000001';
describe('concierge support response boundaries',()=>{
 it('rejects preferences without consent and another stay',()=>{
  const row={reservationId:id,revision:1,consent:false,preferences:''};
  expect(preferenceState(row,id)).toEqual(row);
  expect(()=>preferenceState({...row,preferences:'Private'},id)).toThrow();
  expect(()=>preferenceState(row,'another')).toThrow();
  expect(()=>guestContext({...row,guestName:'Guest',confirmationCode:'B1',unitCode:null,preferences:'Private'})).toThrow();
 });
 it('bounds knowledge pages and article content',()=>{
  const article={id,language:'ru',title:'Parking',content:'Ask reception',active:true,revision:1,updated_at:'2026-10-12T00:00:00Z'};
  expect(knowledgePage({items:[article],nextCursor:null}).items).toHaveLength(1);
  for(const items of [Array(11).fill(article),[{...article,content:'x'.repeat(501)}],[{...article,revision:0}],[{...article,language:'invalid'}]])expect(()=>knowledgePage({items,nextCursor:null})).toThrow();
 });
});
