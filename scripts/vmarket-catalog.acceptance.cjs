const fs = require('node:fs');
const assert = require('node:assert/strict');
const path = require('node:path');
const file = path.resolve(__dirname, '../apps/web/public/vmarket/catalog.json');
const catalog = JSON.parse(fs.readFileSync(file, 'utf8'));
const rows = catalog.products;
assert.equal(catalog.schemaVersion, 4);
assert.equal(catalog.currency, 'UZS');
assert.equal(catalog.markupRate, 0.25);
assert.equal(rows.length, 195);
assert.equal(new Set(rows.map(p => p.id)).size, 195);
assert.equal(rows.reduce((n,p) => n + p.stock, 0), 3697);
assert.equal(rows.filter(p => p.unitsPerBlock !== null).length, 39);
for (const p of rows) {
  assert.equal(typeof p.name, 'string');
  assert.ok(p.name.trim());
  assert.ok(Number.isSafeInteger(p.stock) && p.stock >= 0);
  assert.ok(Number.isFinite(p.cost) && p.cost >= 0);
  assert.ok(Number.isFinite(p.price) && p.price >= 0);
  if (p.unitsPerBlock !== null) assert.ok(Number.isSafeInteger(p.unitsPerBlock) && p.unitsPerBlock > 0);
  if (p.imageReviewStatus === 'approved') assert.match(p.imageUrl, /^https:\/\//);
}
console.log('V Market catalog: 195 products, 39 block products, 3697 stock units: PASS');
