const assert = require('node:assert/strict');
function verifyNativeStorage(report, settings, expectedVersion) {
  assert.match(settings, /expoAutolinking\.useExpoModules\(\)/,
    'Generated Gradle settings must enable Expo modules');
  const matches = report.modules?.filter(module => module.packageName === 'expo-file-system') ?? [];
  assert.equal(matches.length, 1, 'Exactly one file-system native package is required');
  assert.equal(matches[0].packageVersion, expectedVersion, 'Native file-system version mismatch');
  const classes = matches[0].projects.flatMap(project => project.modules ?? []).map(module => module.classifier);
  assert.ok(classes.includes('expo.modules.filesystem.legacy.FileSystemLegacyModule'),
    'Preferences use the legacy API: its native module must be linked');
  return {packageName: 'expo-file-system', version: expectedVersion, legacyModuleResolved: true};
}
module.exports = {verifyNativeStorage};
