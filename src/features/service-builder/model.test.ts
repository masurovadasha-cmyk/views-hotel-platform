import {describe,it,expect,vi} from 'vitest';
import {emptyDraft,blankLabels,decide,validateDraft,parseRecord,draftIssues,dryRun,type Draft} from './model';
const names={ru:'Уборка',uz:'Tozalash',en:'Cleaning'};
const valid=():Draft=>({code:'DEMO-1',names,category:'cleaning',fields:[{id:'field-1',labels:names,type:'text',required:true,options:[]}]});
describe('local service draft contract',()=>{
 it('reads legacy format1 without rewriting and upgrades only an intentional pricing edit',()=>{
  const legacy={format:1 as const,revision:7,draft:valid()},bytes=JSON.stringify(legacy);
  expect(decide(legacy,undefined)).toEqual(legacy);expect(decide(legacy,7,valid())).toEqual(legacy);
  const priced:Draft={...valid(),pricing:{kind:'unit',currency:'UZS',unitMinor:'125'}};
  const saved=decide(legacy,7,priced);expect(saved).toEqual({format:2,revision:8,draft:priced});
  expect(JSON.stringify(legacy)).toBe(bytes);expect(decide(saved,8,priced)).toEqual(saved);
  expect(()=>decide(saved,7,valid())).toThrow('changed');
  expect(decide(saved,8,valid())).toEqual({format:2,revision:9,draft:{...valid(),pricing:null}});
  expect(parseRecord(JSON.parse(JSON.stringify(saved)))).toEqual(saved);
  expect(()=>parseRecord({...saved,format:1})).toThrow('invalid');
  expect(()=>parseRecord({...legacy,format:2})).toThrow('invalid');
  expect(()=>parseRecord({...saved,format:3})).toThrow('invalid');
  const loaded=parseRecord(saved);if(loaded.draft.pricing)loaded.draft.pricing.unitMinor='999';
  expect(saved.draft.pricing?.unitMinor).toBe('125');
 });
 it('rejects malformed pricing before any save and preserves stored state',()=>{
  const legacy={format:1,revision:1,draft:valid()},bytes=JSON.stringify(legacy);
  for(const pricing of [{kind:'unit',currency:'UZS',unitMinor:''},{kind:'unit',currency:'UZS',unitMinor:'01'},{kind:'fixed',currency:'UZS',unitMinor:'125'}])expect(()=>decide(legacy,1,{...valid(),pricing} as Draft)).toThrow('invalid');
  expect(JSON.stringify(legacy)).toBe(bytes);
 });
 it('deep-copies nested choices and saves/reloads/dry-runs without structuredClone',()=>{
  vi.stubGlobal('structuredClone',undefined);
  try{
   const d:Draft={code:'CHOICE',names:{ru:'Услуга',uz:'Xizmat',en:'Service'},category:'cleaning',fields:[{id:'field-1',labels:{ru:'Вариант',uz:'Variant',en:'Option'},type:'choice',required:true,options:[{ru:'Первый',uz:'Birinchi',en:'First'},{ru:'Второй',uz:'Ikkinchi',en:'Second'}]}]};
   const copy=validateDraft(d);expect(copy).toEqual(d);
   expect(copy.names).not.toBe(d.names);expect(copy.fields).not.toBe(d.fields);expect(copy.fields[0]).not.toBe(d.fields[0]);expect(copy.fields[0].labels).not.toBe(d.fields[0].labels);expect(copy.fields[0].options).not.toBe(d.fields[0].options);expect(copy.fields[0].options[0]).not.toBe(d.fields[0].options[0]);
   const saved=decide(undefined,0,d);expect(saved.revision).toBe(1);
   d.names.en='Changed';d.fields[0].labels.en='Changed';d.fields[0].options[0].en='Changed';d.fields[0].options.push({ru:'Третий',uz:'Uchinchi',en:'Third'});
   expect(saved.draft).toEqual(copy);
   const reloaded=parseRecord(JSON.parse(JSON.stringify(saved)));expect(reloaded).toEqual(saved);expect(dryRun(reloaded.draft,{'field-1':'1'})).toEqual({ok:true,configuration:[],fields:[]});
   reloaded.draft.fields[0].options[1].en='Reload edit';expect(saved.draft.fields[0].options[1].en).toBe('Second');expect(globalThis.structuredClone).toBeUndefined();
  }finally{vi.unstubAllGlobals();}
 });
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
