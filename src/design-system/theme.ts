export type Theme = 'light' | 'dark';
const storageKey = 'views.theme';

// An explicit preference wins. Invalid or unavailable storage keeps the default
// light presentation usable, including in private browsing and Android WebView.
export function readTheme(): Theme {
  try { return localStorage.getItem(storageKey) === 'dark' ? 'dark' : 'light'; }
  catch { return 'light'; }
}

export function saveTheme(theme: Theme): void {
  try { localStorage.setItem(storageKey, theme); }
  catch { /* The current session still uses the selected theme. */ }
}
