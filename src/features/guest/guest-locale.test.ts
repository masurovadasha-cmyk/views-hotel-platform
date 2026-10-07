/// <reference types="vite/client" />
import {describe,it,expect} from 'vitest';
import ts from 'typescript';
import catalog from './guest-translations.json';
import {parseGuestLocale,translateGuest} from './GuestLocale';
import {apartments} from '../../data/demo';
const fields=(text:string)=>[...text.matchAll(/\{([A-Za-z]+)\}/g)].map(match=>match[1]).sort();
describe('guest localization',()=>{
 it('has Russian and Uzbek messages with identical interpolation fields',()=>{
  for(const [source,translations]of Object.entries(catalog))for(const value of Object.values(translations)){
   expect(value.trim(),source).not.toBe('');expect(fields(value),source).toEqual(fields(source));
   expect(value).not.toContain('{t(');
  }
 });
 it('covers all literal translation calls in guest screens and public sign-in',()=>{
  const files=import.meta.glob<string>(['./*.tsx','../auth/AuthPanel.tsx','../../App.tsx'],{query:'?raw',import:'default',eager:true});
  for(const [file,content]of Object.entries(files)){
   const tree=ts.createSourceFile(file,content,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
   function visit(node:ts.Node){
    if(ts.isCallExpression(node)&&node.arguments[0]&&ts.isStringLiteral(node.arguments[0])&&node.expression.getText(tree)===(file.endsWith('/App.tsx')?'guestT':'t')){
     const key=node.arguments[0].text;expect(Object.hasOwn(catalog,key),file+': '+key).toBe(true);
    }ts.forEachChild(node,visit);
   }visit(tree);
  }
 });
 it('covers static demo names and amenities without changing the original data',()=>{
  for(const apartment of apartments)for(const value of [apartment.title,apartment.city,...apartment.amenities]){
   expect(Object.hasOwn(catalog,value),value).toBe(true);
  }
  expect(apartments[0].title).toBe('Views | Modern Design Apartment | Views');
 });
 it('keeps the existing English default and rejects unsupported stored values',()=>{
  for(const value of [null,undefined,'ru-RU','constructor',{},''])expect(parseGuestLocale(value)).toBe('en');
  expect(parseGuestLocale('ru')).toBe('ru');expect(parseGuestLocale('uz')).toBe('uz');
 });
 it('interpolates text once and leaves unknown server values unchanged',()=>{
  expect(translateGuest('ru','Add to favorites: {name}',{name:'<b>$& {count}</b>'})).toBe('В избранное: <b>$& {count}</b>');
  expect(translateGuest('uz','Listings: {count}. Choose dates to preview the booking steps.',{count:2})).toBe('Eʼlonlar: 2. Bronlash bosqichlarini koʻrish uchun sanalarni tanlang.');
  expect(translateGuest('ru','Untranslated property name')).toBe('Untranslated property name');
  expect(translateGuest('uz','constructor')).toBe('constructor');
 });
});
