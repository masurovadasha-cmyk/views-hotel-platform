import {describe,expect,it} from 'vitest';
import {appendSection,kinds,parseQueue,type Section} from './model';
import {queueText} from './locale';
const row={id:'00000000-0000-4000-8000-000000000001',kind:'cleaning' as const,stage:'requested',revision:1,unitCode:'235',sla:null};
const section:Section={kind:'cleaning',status:'available',items:[row],nextCursor:null};
describe('operations queue response boundary',()=>{
 it('requires every requested source, without treating missing source as empty',()=>{
  expect(()=>parseQueue({sections:[section]})).toThrow();
  expect(parseQueue({sections:kinds.map(kind=>({kind,status:'forbidden',items:[],nextCursor:null}))})).toHaveLength(4);
 });
 it('accepts one explicitly requested source, refuses wrong source and duplicates',()=>{
  expect(parseQueue({sections:[section]},'cleaning')[0]).toEqual(section);
  expect(()=>parseQueue({sections:[section]},'market')).toThrow();
  expect(()=>parseQueue({sections:[{...section,items:[row,row]}]},'cleaning')).toThrow();
 });
 it.each([{status:'forbidden'},{nextCursor:'bad'},{nextCursor:'00000000-0000-4000-8000-000000000002'},{items:[{...row,revision:0}]},{items:[{...row,sla:{state:'overdue'}}]}])('rejects malformed/unauthorized section %j',change=>expect(()=>parseQueue({sections:[{...section,...change}]},'cleaning')).toThrow());
 it('deduplicates repeated pages and replaces newer revisions without resetting other data',()=>{
  const second={...row,id:'00000000-0000-4000-8000-000000000002'};
  expect(appendSection(section,{...section,items:[{...row,revision:2},second]}).items).toEqual([{...row,revision:2},second]);
  expect(appendSection(section,{...section,status:'forbidden',items:[]})).toEqual({...section,status:'forbidden',items:[]});
 });
 it.each(['ru','uz','en'])('has explicit scope and chronology limits in %s',locale=>{
  expect(queueText(locale,'notice').length).toBeGreaterThan(40);expect(queueText(locale,'noSla').length).toBeGreaterThan(10);expect(queueText(locale,'error').length).toBeGreaterThan(30);
 });
});
