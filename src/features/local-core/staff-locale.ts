import {translate} from '../../i18n/messages';
import catalog from './staff-translations.json';

export type StaffLocale = 'ru' | 'uz' | 'en';
export const localeTags: Record<StaffLocale, string> = {ru: 'ru-RU', uz: 'uz-Latn-UZ', en: 'en-GB'};
export const staffLocaleStorageKey = 'views.staff.locale';
export function parseStaffLocale(value: unknown): StaffLocale {
  return value === 'uz' || value === 'en' ? value : 'ru';
}
export type MessageValues = Record<string, string | number>;
const messages: Record<string, {en: string; uz: string}> = catalog;

/** Russian source messages are catalog keys; runtime/user data is never scanned. */
export function translateStaff(locale: StaffLocale, source: string, values: MessageValues = {}): string {
  return translate(messages,locale,source,values);
}

/** Preserve bigint minor units; do not round money through Number. */
export function formatStaffMoney(minor: string, locale: StaffLocale = 'ru'): string {
  if (!/^\d+$/.test(minor)) return '—';
  const amount = BigInt(minor), fraction = amount % 100n;
  const numberFormat = new Intl.NumberFormat(localeTags[locale]);
  const whole = numberFormat.format(amount / 100n);
  const separator = numberFormat.formatToParts(1.1).find(part => part.type === 'decimal')!.value;
  return whole + (fraction ? separator + fraction.toString().padStart(2, '0') : '') + ' UZS';
}

export function localizedName(value: Record<string, string>, locale: StaffLocale): string {
  return value[locale] || value.ru || value.en || value.uz || Object.values(value)[0] || '—';
}
