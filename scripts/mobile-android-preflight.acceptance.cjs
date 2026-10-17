const {test} = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {inspectAndroid} = require('./mobile-android-preflight.cjs');
const required = {compileSdk:'36', buildTools:'36.0.0', ndkVersion:'27.1.12297006'};
test('unset SDK cannot pass even with permissive filesystem probe', () => {
  assert.equal(inspectAndroid(undefined, required, () => true).buildPrerequisitesPresent, false);
});
test('old SDK rejects build readiness and identifies missing components', () => {
  const report = inspectAndroid('/sdk', required, file => file === path.join('/sdk','platform-tools/adb'));
  assert.equal(report.buildPrerequisitesPresent, false);
  assert.equal(report.checks.platform.present, false);
  assert.equal(report.checks.ndk.present, false);
});
test('complete SDK is only prerequisite evidence, never native acceptance', () => {
  const report = inspectAndroid('/sdk', required, () => true);
  assert.equal(report.buildPrerequisitesPresent, true);
  assert.equal(report.nativeAcceptance, 'NOT_RUN');
});
