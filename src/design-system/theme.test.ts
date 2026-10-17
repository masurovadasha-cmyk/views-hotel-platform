import {afterEach, describe, expect, it, vi} from 'vitest';
import {readTheme, saveTheme} from './theme';

afterEach(() => vi.unstubAllGlobals());

describe('theme preference across browser sessions', () => {
  it('restores a saved choice and ignores unsupported values', () => {
    let stored: string | null = null;
    vi.stubGlobal('localStorage', {
      getItem: () => stored,
      setItem: (_key: string, value: string) => { stored = value; },
    });
    expect(readTheme()).toBe('light');
    saveTheme('dark');
    expect(readTheme()).toBe('dark');
    stored = 'invalid';
    expect(readTheme()).toBe('light');
  });
  it('remains usable when storage is denied', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('denied'); },
      setItem: () => { throw new Error('denied'); },
    });
    expect(readTheme()).toBe('light');
    expect(() => saveTheme('dark')).not.toThrow();
  });
});
