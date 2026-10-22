const {test} = require('node:test');
const assert = require('node:assert/strict');
const {verifyNativeStorage} = require('./mobile-native-modules.cjs');
const settings = 'expoAutolinking.useExpoModules()';
const fixture = () => ({modules: [{packageName:'expo-file-system', packageVersion:'57.0.7',
  projects:[{modules:[{classifier:'expo.modules.filesystem.legacy.FileSystemLegacyModule'}]}]}]});
test('native storage must have matching version and legacy implementation', () => {
  assert.equal(verifyNativeStorage(fixture(), settings, '57.0.7').legacyModuleResolved, true);
  const missingLegacy=fixture();missingLegacy.modules[0].projects[0].modules=[];
  assert.throws(()=>verifyNativeStorage(missingLegacy,settings,'57.0.7'),/legacy API/);
  assert.throws(()=>verifyNativeStorage(fixture(),settings,'0.0.0'),/version mismatch/);
});
test('missing or duplicate package and disabled Gradle linking reject', () => {
  assert.throws(()=>verifyNativeStorage({modules:[]},settings,'57.0.7'),/Exactly one/);
  const duplicate=fixture();duplicate.modules.push(duplicate.modules[0]);
  assert.throws(()=>verifyNativeStorage(duplicate,settings,'57.0.7'),/Exactly one/);
  assert.throws(()=>verifyNativeStorage(fixture(),'','57.0.7'),/enable Expo/);
});
