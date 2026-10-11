/// <reference types="vite/client" />
import {describe,expect,it} from 'vitest';
import ts from 'typescript';
import catalog from './legacy-staff-translations.json';
import {translate} from '../../i18n/messages';
import {legacyDate} from './LegacyStaffLocale';
const fields=(s:string)=>[...s.matchAll(/\{([a-zA-Z]+)\}/g)].map(m=>m[1]).sort();
describe('legacy staff language boundary',()=>{
 it('covers literal display messages and preserves interpolation in both translations',()=>{
  for(const [key,value] of Object.entries(catalog))for(const locale of ['ru','uz'] as const){expect(value[locale].trim(),key).not.toBe('');expect(fields(value[locale]),key).toEqual(fields(key));}
  const components=import.meta.glob<string>('./*.tsx',{query:'?raw',import:'default',eager:true});
  for(const [file,text] of Object.entries(components)){
   const ast=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
   function visit(n:ts.Node){if(ts.isCallExpression(n)&&n.expression.getText(ast)==='t'&&n.arguments[0]&&ts.isStringLiteral(n.arguments[0]))expect(Object.hasOwn(catalog,n.arguments[0].text),file+': '+n.arguments[0].text).toBe(true);ts.forEachChild(n,visit);}visit(ast);
  }
 });
 it('keeps unknown data and interpolation literal, without a second translation pass',()=>{
  expect(translate(catalog,'ru','Unknown server value')).toBe('Unknown server value');
  expect(translate(catalog,'uz','Created: {id}',{id:'<b>$& {count}</b>'})).toBe('Yaratildi: <b>$& {count}</b>');
  expect(translate(catalog,'en','constructor')).toBe('constructor');
 });
 it('formats dates in Tashkent and preserves invalid server text',()=>{
  expect(legacyDate('2026-10-07T19:00:00Z','en')).toContain('8 Oct 2026');
  expect(legacyDate('2026-10-07','en',true)).toBe('7 Oct 2026');
  expect(legacyDate('not-a-date','ru')).toBe('not-a-date');
 });
});
