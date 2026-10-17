const fs = require('node:fs');
const path = require('node:path');
const {createRequire} = require('node:module');
function inspectAndroid(sdk, requirements, exists = fs.existsSync) {
  const required = {
    platform: `platforms/android-${requirements.compileSdk}/android.jar`,
    buildTools: `build-tools/${requirements.buildTools}/source.properties`,
    ndk: `ndk/${requirements.ndkVersion}/source.properties`,
    adb: `platform-tools/${process.platform === 'win32' ? 'adb.exe' : 'adb'}`,
  };
  const checks = Object.fromEntries(Object.entries(required).map(([name, relative]) =>
    [name, { required: relative, present: Boolean(sdk) && exists(path.join(sdk, relative)) }]));
  return { sdkConfigured: Boolean(sdk), requirements, checks,
    buildPrerequisitesPresent: Object.values(checks).every(check => check.present),
    nativeAcceptance: 'NOT_RUN' };
}
function installedRequirements() {
  const mobile = createRequire(path.resolve(__dirname, '../apps/mobile/package.json'));
  const root = path.dirname(mobile.resolve('react-native/package.json'));
  const toml = fs.readFileSync(path.join(root, 'gradle/libs.versions.toml'), 'utf8');
  return Object.fromEntries(['compileSdk', 'buildTools', 'ndkVersion'].map(key => {
    const value = toml.match(new RegExp(`^${key} = "([^"]+)"`, 'm'))?.[1];
    if (!value) throw new Error(`Missing React Native requirement: ${key}`);
    return [key, value];
  }));
}
if (require.main === module) {
  const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
  const report = inspectAndroid(sdk, installedRequirements());
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.buildPrerequisitesPresent ? 0 : 1;
}
module.exports = {inspectAndroid};
