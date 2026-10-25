import {describe,it,expect} from 'vitest';
import {emptyDraft,blankLabels,decide,validateDraft,parseRecord,draftIssues,dryRun,type Draft} from './model';
const names={ru:'Уборка',uz:'Tozalash',en:'Cleaning'};
const valid=():Draft=>({code:'DEMO-1',names,category:'cleaning',fields:[{id:'field-1',labels:names,type:'text',required:true,options:[]}]});
describe('local service draft contract',()=>{
 it('starts empty without persisting and preserves incomplete drafts',()=>{
  expect(decide(undefined,undefined)).toEqual({format:1,revision:0,draft:emptyDraft()});
  const d=emptyDraft();d.code='DRAFT';const saved=decide(undefined,0,d);
  expect(saved.revision).toBe(1);expect(draftIssues(saved.draft)).toContain('names');expect(decide(saved,1,d)).toEqual(saved);
 });
 it('serializes competing revisions and never overwrites stale or corrupt state',()=>{
  const original={format:1,revision:1,draft:valid()};const copy=JSON.stringify(original),next={...valid(),code:'DEMO-2'};
  expect(decide(original,1,next).revision).toBe(2);expect(()=>decide(original,0,next)).toThrow('changed');expect(JSON.stringify(original)).toBe(copy);
  for(const data of [null,'{}',{...original,format:2},{...original,revision:NaN},{...original,draft:{...valid(),fields:null}}])expect(()=>decide(data,1,next)).toThrow();
  expect(()=>decide({...original,revision:Number.MAX_SAFE_INTEGER},Number.MAX_SAFE_INTEGER,next)).toThrow('limit');
 });
 it('bounds fields, types, identifiers and localized strings without evaluating content',()=>{
  const d=valid();d.names.en='<script>alert(1)</script>';expect(validateDraft(d).names.en).toBe(d.names.en);
  for(const bad of [{...d,code:'<script>'},{...d,names:{...names,en:'x'.repeat(101)}},{...d,fields:Array.from({length:9},(_,i)=>({...d.fields[0],id:'field-'+(i+1)}))},{...d,fields:[d.fields[0],d.fields[0]]},{...d,fields:[{...d.fields[0],type:'javascript'}]},{...d,fields:[{...d.fields[0],options:[names]}]},{...d,extra:true}])expect(()=>validateDraft(bad)).toThrow('invalid');
  expect(()=>parseRecord({format:1,revision:1,draft:d,unknown:1})).toThrow('invalid');
 });
 it('validates deterministic sample answers and real calendar dates, never returns order or money',()=>{
  const d=valid();expect(dryRun(d,{}).ok).toBe(false);expect(dryRun(d,{'field-1':'   '}).ok).toBe(false);expect(dryRun(d,{'field-1':'sample'})).toEqual({ok:true,configuration:[],fields:[]});
  d.fields[0].type='date';for(const date of ['2027-02-29','2026-04-31','tomorrow'])expect(dryRun(d,{'field-1':date}).ok).toBe(false);
  expect(dryRun(d,{'field-1':'2028-02-29'}).ok).toBe(true);d.fields[0].type='consent';expect(dryRun(d,{'field-1':false}).ok).toBe(false);expect(dryRun(d,{'field-1':true}).ok).toBe(true);
  d.fields[0].type='choice';d.fields[0].options=[names,{ru:'Другое',uz:'Boshqa',en:'Other'}];expect(dryRun(d,{'field-1':'1'}).ok).toBe(true);expect(dryRun(d,{'field-1':'2'}).ok).toBe(false);d.fields[0].options=[names,names];expect(draftIssues(d)).toContain('options');
 });
 it('accepts zero fields only for editing and requires labels and choices for dry run',()=>{
  expect(draftIssues(emptyDraft())).toEqual(['names','fields']);const d=valid();d.fields[0].labels=blankLabels();expect(draftIssues(d)).toEqual(['labels']);
 });
});
