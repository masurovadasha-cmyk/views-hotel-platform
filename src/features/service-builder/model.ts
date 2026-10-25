export const locales=['ru','uz','en'] as const;
export type Locale=typeof locales[number];
export type Labels=Record<Locale,string>;
export const fieldTypes=['text','date','choice','consent'] as const;
export type Field={id:string;labels:Labels;type:typeof fieldTypes[number];required:boolean;options:Labels[]};
export type Draft={code:string;names:Labels;category:'cleaning'|'concierge'|'maintenance';fields:Field[]};
export type RecordValue={format:1;revision:number;draft:Draft};
export const blankLabels=():Labels=>({ru:'',uz:'',en:''});
export const emptyDraft=():Draft=>({code:'',names:blankLabels(),category:'cleaning',fields:[]});
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const text=(v:unknown,max:number):v is string=>typeof v==='string'&&v.length<=max&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v);
function labels(v:unknown):v is Labels{return object(v)&&Object.keys(v).length===3&&locales.every(l=>text(v[l],100));}
export function validateDraft(value:unknown):Draft{
 if(!object(value)||Object.keys(value).sort().join()!=='category,code,fields,names'||!text(value.code,32)||!/^[-A-Z0-9]*$/.test(value.code)||!labels(value.names)||!['cleaning','concierge','maintenance'].includes(String(value.category))||!Array.isArray(value.fields)||value.fields.length>8)throw Error('invalid');
 const ids=new Set<string>();
 for(const f of value.fields){
  if(!object(f)||Object.keys(f).sort().join()!=='id,labels,options,required,type'||!text(f.id,32)||!/^field-[1-9][0-9]{0,7}$/.test(f.id)||ids.has(f.id)||!labels(f.labels)||!fieldTypes.includes(f.type as Field['type'])||typeof f.required!=='boolean'||!Array.isArray(f.options)||f.options.length>6||!f.options.every(labels)||(f.type!=='choice'&&f.options.length))throw Error('invalid');
  ids.add(f.id);
 }
 return structuredClone(value) as Draft;
}
export function parseRecord(value:unknown):RecordValue{
 if(!object(value)||Object.keys(value).sort().join()!=='draft,format,revision'||value.format!==1||!Number.isSafeInteger(value.revision)||Number(value.revision)<1)throw Error('invalid');
 return {format:1,revision:Number(value.revision),draft:validateDraft(value.draft)};
}
export function draftIssues(draft:Draft):string[]{
 const errors:string[]=[];
 if(!draft.code||!locales.every(l=>draft.names[l].trim()))errors.push('names');
 if(!draft.fields.length)errors.push('fields');
 for(const f of draft.fields){
  if(!locales.every(l=>f.labels[l].trim()))errors.push('labels');
  if(f.type==='choice'&&(f.options.length<2||!f.options.every(o=>locales.every(l=>o[l].trim()))||locales.some(l=>new Set(f.options.map(o=>o[l].trim().toLowerCase())).size!==f.options.length)))errors.push('options');
 }
 return [...new Set(errors)];
}
export type Answers=Record<string,string|boolean>;
export function dryRun(draft:Draft,answers:Answers):{configuration:string[];fields:string[];ok:boolean}{
 const configuration=draftIssues(validateDraft(draft)),fields:string[]=[];
 for(const f of draft.fields){const a=answers[f.id],missing=a===undefined||a===''||(typeof a==='string'&&!a.trim())||a===false;
  if(missing){if(f.required)fields.push(f.id);continue;}
  if(f.type==='consent'?a!==true:f.type==='text'?(!text(a,500)):f.type==='choice'?(typeof a!=='string'||!/^\d$/.test(a)||Number(a)>=f.options.length):(typeof a!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(a)||!Number.isFinite(Date.parse(a+'T00:00:00Z'))||new Date(a+'T00:00:00Z').toISOString().slice(0,10)!==a))fields.push(f.id);
 }
 return {configuration,fields,ok:configuration.length===0&&fields.length===0};
}
export function decide(value:unknown,expected:number|undefined,draft?:Draft):RecordValue|{format:1;revision:0;draft:Draft}{
 const current=value===undefined?{format:1 as const,revision:0,draft:emptyDraft()}:parseRecord(value);
 if(expected===undefined)return current;
 if(expected!==current.revision)throw Error('changed');
 const next=validateDraft(draft);
 if(JSON.stringify(next)===JSON.stringify(current.draft))return current;
 if(current.revision===Number.MAX_SAFE_INTEGER)throw Error('limit');
 return {format:1,revision:current.revision+1,draft:next};
}
