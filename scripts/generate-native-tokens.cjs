const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'packages/ui/tokens.css'), 'utf8');
function colors(selector) {
  const body = css.slice(css.indexOf(selector) + selector.length).split('}')[0];
  return Object.fromEntries([...body.matchAll(/--([\w-]+):\s*(#[\da-f]{6});/gi)].map(([, key, value]) => [key, value]));
}
const light = colors('.app {');
const dark = { ...light, ...colors('.app.dark {') };
if (Object.keys(light).length !== 17) throw new Error('Review native palette mapping after CSS changes');
const output = '// Generated from tokens.css; run node scripts/generate-native-tokens.cjs.\n'
  + 'export const nativeColors = ' + JSON.stringify({ light, dark }, null, 2) + ' as const;\n'
  + 'export type NativeTheme = keyof typeof nativeColors;\n';
const target = path.join(root, 'packages/ui/native.ts');
if (process.argv.includes('--check')) {
  if (fs.readFileSync(target, 'utf8') !== output) throw new Error('Native tokens drift: regenerate');
} else fs.writeFileSync(target, output);
