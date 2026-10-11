import {describe,it,expect} from 'vitest';
import {translate,locales} from '@views/shared/i18n';
import {translate as legacyTranslate} from './messages';
describe('shared i18n contract',()=>{
 it('keeps the legacy entry point and supported languages',()=>{expect(legacyTranslate).toBe(translate);expect(locales).toEqual(['ru','uz','en']);});
 it('preserves fallback and placeholders including zero',()=>{
  expect(translate({'Hello {name}':{ru:'Привет {name}'}},'ru','Hello {name}',{name:'Гость'})).toBe('Привет Гость');
  expect(translate({},'uz','Total {n}',{n:0})).toBe('Total 0');
  expect(translate({Hi:{ru:'Привет'}},'en','Hi')).toBe('Hi');
  expect(translate({},'en','Unknown {name}')).toBe('Unknown {name}');
 });
 it('does not interpolate inherited fields',()=>{
  expect(translate(Object.create({Hi:{ru:'hidden'}}),'ru','Hi')).toBe('Hi');
  expect(translate({},'ru','{name}',Object.create({name:'hidden'}))).toBe('{name}');
 });
});
