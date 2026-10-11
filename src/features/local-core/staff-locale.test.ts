/// <reference types="vite/client" />
import {describe, it, expect} from 'vitest';
import ts from 'typescript';
import catalog from './staff-translations.json';
import {formatStaffMoney, localizedName, parseStaffLocale, translateStaff} from './staff-locale';

const placeholders = (text: string) => [...text.matchAll(/\{([a-zA-Z]+)\}/g)].map(match => match[1]).sort();
describe('staff locales', () => {
  it('has complete English and Uzbek text with matching interpolation fields', () => {
    for (const [source, translations] of Object.entries(catalog)) {
      for (const value of Object.values(translations)) {
        expect(value.trim(), source).not.toBe('');
        expect(value, source).not.toMatch(/[А-Яа-яЁё]/);
        expect(placeholders(value), source).toEqual(placeholders(source));
      }
    }
  });
  it('covers Russian source messages in every local workspace component', () => {
    const components = import.meta.glob<string>('./*.tsx', {query: '?raw', import: 'default', eager: true});
    for (const [file, text] of Object.entries(components)) {
      const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      function visit(node: ts.Node) {
        if ((ts.isStringLiteral(node) || ts.isJsxText(node)) && /[А-Яа-яЁё]/.test(node.text)) {
          const key = ts.isJsxText(node) ? node.text.trim() : node.text;
          if (key !== 'Русский') expect(Object.hasOwn(catalog, key), `${file}: ${key}`).toBe(true);
        }
        ts.forEachChild(node, visit);
      }
      visit(source);
    }
  });
  it('interpolates once without interpreting HTML, replacement syntax or new placeholders', () => {
    expect(translateStaff('uz', 'Номер {unit}', {unit: '<b>$& {total}</b>'})).toBe('<b>$& {total}</b>-xona');
    expect(translateStaff('en', 'Показаны {shown} из {total} документов.', {shown: 2, total: 5})).toBe('Showing 2 of 5 documents.');
    expect(translateStaff('en', 'Номер {unit}')).toBe('Room {unit}');
    expect(translateStaff('en', 'constructor')).toBe('constructor');
    expect(translateStaff('ru', 'Ресепшен')).toBe('Ресепшен');
  });
  it('only accepts supported persisted language values', () => {
    for (const invalid of [null, undefined, 'en-US', '<script>', 'constructor', {}, 1]) expect(parseStaffLocale(invalid)).toBe('ru');
    expect(parseStaffLocale('en')).toBe('en');
    expect(parseStaffLocale('uz')).toBe('uz');
  });
  it('formats fractional and large money without losing minor units', () => {
    expect(formatStaffMoney('900719925474099301', 'en')).toBe('9,007,199,254,740,993.01 UZS');
    expect(formatStaffMoney('123456', 'ru').replace(/\s/g, ' ')).toBe('1 234,56 UZS');
    expect(formatStaffMoney('123456', 'uz').replace(/\s/g, ' ')).toBe('1 234,56 UZS');
    expect(formatStaffMoney('0', 'en')).toBe('0 UZS');
    expect(formatStaffMoney('-1')).toBe('—');
    expect(formatStaffMoney('not money')).toBe('—');
  });
  it('selects provided localized names and preserves server fallback data', () => {
    expect(localizedName({ru: 'Номер', en: 'Room', uz: 'Xona'}, 'uz')).toBe('Xona');
    expect(localizedName({ru: 'Серверное имя'}, 'en')).toBe('Серверное имя');
    expect(localizedName({}, 'en')).toBe('—');
  });
});
