const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createRequire } = require('node:module');
const path = require('node:path');
const mobile = createRequire(path.resolve('apps/mobile/package.json'));
const expo = createRequire(mobile.resolve('expo/package.json'));
const plugins = createRequire(expo.resolve('@expo/config-plugins/package.json'));
const xcodeRequire = createRequire(plugins.resolve('xcode/package.json'));
const uuid = xcodeRequire('uuid');

test('xcode UUID dependency rejects truncated output buffers', () => {
  for (const version of ['v3', 'v5']) {
    assert.throws(() => uuid[version]('views', uuid[version].DNS, new Uint8Array(15)));
    assert.throws(() => uuid[version]('views', uuid[version].DNS, new Uint8Array(16), 1));
    const buffer = new Uint8Array(18).fill(255);
    uuid[version]('views', uuid[version].DNS, buffer, 1);
    assert.equal(buffer[0], 255);
    assert.equal(buffer[17], 255);
    assert.equal(uuid.stringify(buffer, 1), uuid[version]('views', uuid[version].DNS));
  }
});

test('xcode retains CommonJS UUID generation and project round-trip', () => {
  const xcode = plugins('xcode');
  const project = xcode.project('synthetic.pbxproj');
  project.hash = { project: { archiveVersion: 1, objectVersion: 46,
    objects: { PBXGroup: {} }, rootObject: '000000000000000000000001' } };
  const ids = new Set();
  for (let i = 0; i < 100; i++) {
    const id = project.generateUuid();
    assert.match(id, /^[A-F0-9]{24}$/);
    assert.ok(!ids.has(id));
    ids.add(id);
    project.hash.project.objects.PBXGroup[id] = { isa: 'PBXGroup', children: [], name: `Group${i}` };
  }
  const parser = xcodeRequire('./lib/parser/pbxproj');
  const parsed = parser.parse(project.writeSync());
  assert.equal(Object.keys(parsed.project.objects.PBXGroup).length, 100);
});
