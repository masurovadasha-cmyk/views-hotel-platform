// Test-only contract assertion; not imported by application modules.
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
const contract=JSON.parse(readFileSync(resolve(process.cwd(),'../../contracts/guest-trips.openapi.json'),'utf8'));
export function assertTripContract(value:unknown,name:string){
 const visit=(v:unknown,s:Record<string,any>):void=>{
  if(s.$ref)return visit(v,contract.components.schemas[s.$ref.split('/').at(-1)]);
  if(v===null&&s.nullable)return;
  if(s.type==='string'){
   assert.equal(typeof v,'string');
   if(s.pattern)assert.match(v as string,new RegExp(s.pattern));
   if(s.format==='date-time')assert.ok(Number.isFinite(Date.parse(v as string)));
  }else if(s.type==='array'){
   assert.ok(Array.isArray(v));if(s.maxItems)assert.ok(v.length<=s.maxItems);
   v.forEach(x=>visit(x,s.items));
  }else if(s.type==='object'){
   assert.ok(v&&typeof v==='object'&&!Array.isArray(v));const r=v as Record<string,unknown>;
   for(const key of s.required||[])assert.ok(Object.hasOwn(r,key),key);
   for(const [key,item] of Object.entries(r)){
    const child=s.properties?.[key]||s.additionalProperties;assert.ok(child,'Undocumented response field: '+key);visit(item,child);
   }
  }else throw Error('Unsupported contract schema');
 };
 visit(value,contract.components.schemas[name]);
}
