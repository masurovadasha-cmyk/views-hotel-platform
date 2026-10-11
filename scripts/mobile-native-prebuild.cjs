// Generates disposable native projects. Does not build, sign, install or launch APKs.
const fs = require('node:fs');
const {verifyNativeStorage} = require('./mobile-native-modules.cjs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const {createRequire} = require('node:module');
const source = path.resolve(__dirname, '../apps/mobile');
const mobile = createRequire(path.join(source, 'package.json'));
const cli = path.join(path.dirname(mobile.resolve('expo/package.json')), 'bin/cli');
const expo = createRequire(mobile.resolve('expo/package.json'));
const linkingPackage = expo.resolve('expo-modules-autolinking/package.json');
const linkingCli = path.join(path.dirname(linkingPackage), require(linkingPackage).bin['expo-modules-autolinking']);
const fileSystemVersion = require(path.join(source, 'package.json')).dependencies['expo-file-system'];
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'views-native-prebuild-'));
const reports = [];
for (const mode of ['guest', 'staff']) {
  const target = path.join(root, mode);
  fs.mkdirSync(target);
  // Copy source, never build output, native projects or private local env files.
  for (const entry of fs.readdirSync(source, {withFileTypes: true})) {
    if (entry.isFile() && /\.(tsx?|js|json)$/.test(entry.name)) {
      fs.copyFileSync(path.join(source, entry.name), path.join(target, entry.name));
    }
  }
  fs.symlinkSync(path.join(source, 'node_modules'), path.join(target, 'node_modules'), 'junction');
  try {
    const output = execFileSync(process.execPath,
      [cli, 'prebuild', '--platform', 'android', '--no-install'], {
        cwd: target, encoding: 'utf8', timeout: 180000,
        env: {...process.env, CI: '1', EXPO_NO_TELEMETRY: '1', EXPO_PUBLIC_APP_MODE: mode},
      });
    fs.writeFileSync(path.join(target, 'prebuild.log'), output);
    const gradle = fs.readFileSync(path.join(target, 'android/app/build.gradle'), 'utf8');
    const applicationId = gradle.match(/applicationId\s+['"]([^'"]+)['"]/)?.[1];
    assert.equal(applicationId, `uz.views.preview.${mode}`);
    const resources = fs.readFileSync(path.join(target, 'android/app/src/main/res/values/strings.xml'), 'utf8');
    assert.ok(resources.includes(mode === 'guest' ? 'VIEWS Guest Preview' : 'VIEWS Staff Preview'));
    const linking = JSON.parse(execFileSync(process.execPath,
      [linkingCli, 'resolve', '--platform', 'android', '--json'],
      {cwd: target, encoding: 'utf8', timeout: 30000}));
    const settings = fs.readFileSync(path.join(target, 'android/settings.gradle'), 'utf8');
    const nativeStorage = verifyNativeStorage(linking, settings, fileSystemVersion);
    fs.writeFileSync(path.join(target, 'autolinking.json'), JSON.stringify(linking, null, 2));
    reports.push({mode, applicationId, nativeProject: target, generated: true, nativeStorage});
  } catch (error) {
    console.error(`Prebuild failed; inspect ${target}`);
    throw error;
  }
}
assert.notEqual(reports[0].applicationId, reports[1].applicationId);
const report = {profiles: reports, apkBuilt: false, deviceAcceptance: 'NOT_RUN'};
fs.writeFileSync(path.join(root, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
