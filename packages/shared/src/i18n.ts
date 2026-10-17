export const locales = ['ru', 'uz', 'en'] as const;
export type Locale = typeof locales[number];
export type MessageValues = Record<string, string | number>;
export type MessageCatalog = Record<string, Partial<Record<Locale, string>>>;
export function translate(catalog: MessageCatalog, locale: Locale, source: string, values: MessageValues = {}): string {
  const message = Object.prototype.hasOwnProperty.call(catalog, source) ? catalog[source][locale] ?? source : source;
  return message.replace(/\{([a-zA-Z]+)\}/g, (placeholder, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : placeholder);
}
