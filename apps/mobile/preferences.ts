export type Preferences = { locale: 'ru' | 'uz' | 'en'; theme: 'light' | 'dark' };
export const defaults: Preferences = { locale: 'ru', theme: 'light' };
export function decodePreferences(raw: string | null): Preferences {
  try {
    const value: unknown = JSON.parse(raw ?? 'null');
    if (!value || typeof value !== 'object') return { ...defaults };
    const record = value as Record<string, unknown>;
    if (record.version !== 1) return { ...defaults };
    return {
      locale: record.locale === 'en' || record.locale === 'uz' ? record.locale : 'ru',
      theme: record.theme === 'dark' ? 'dark' : 'light',
    };
  } catch { return { ...defaults }; }
}
export function createPreferencesStore(io: {
  read(): Promise<string | null>;
  write(value: string): Promise<void>;
}) {
  let queue: Promise<void> = Promise.resolve();
  return {
    async load() { return decodePreferences(await io.read()); },
    save(value: Preferences) {
      const encoded = JSON.stringify({ version: 1, locale: value.locale, theme: value.theme });
      const result = queue.then(() => io.write(encoded));
      queue = result.catch(() => {});
      return result;
    },
  };
}
