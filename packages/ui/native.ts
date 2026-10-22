// Generated from tokens.css; run node scripts/generate-native-tokens.cjs.
export const nativeColors = {
  "light": {
    "bg": "#f6f5f2",
    "fg": "#20242c",
    "card": "#ffffff",
    "surface": "#eef0f3",
    "muted": "#5f636c",
    "line": "#d6d8de",
    "gold": "#765c2f",
    "gold2": "#a88b58",
    "good": "#296644",
    "warn": "#815916",
    "danger": "#ae3439",
    "success-surface": "#e5f1e8",
    "warning-surface": "#faf0d9",
    "danger-surface": "#fcebed",
    "focus": "#796026",
    "action-bg": "#a88b58",
    "action-fg": "#171a20"
  },
  "dark": {
    "bg": "#1a1d24",
    "fg": "#f2f3f6",
    "card": "#242832",
    "surface": "#303744",
    "muted": "#bfc4ce",
    "line": "#4b5260",
    "gold": "#d9bd7d",
    "gold2": "#a88b58",
    "good": "#8dd9aa",
    "warn": "#eac278",
    "danger": "#ff999c",
    "success-surface": "#213a2c",
    "warning-surface": "#3b3220",
    "danger-surface": "#41292f",
    "focus": "#e2c786",
    "action-bg": "#a88b58",
    "action-fg": "#171a20"
  }
} as const;
export type NativeTheme = keyof typeof nativeColors;
