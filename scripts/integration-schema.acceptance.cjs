'use strict';
// Read-only integration gate. PostgreSQL's canonical migration history is distinct
// from legacy D1 migrations/; never concatenate those two database namespaces.
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const {readMigrations}=require('../apps/api/ops/migrations.cjs');
const root=path.resolve(__dirname,'..');
function uniqueNumbers(names){
 const seen=new Map();
 for(const name of names){
  const match=/^(\d{4})_[a-z0-9_]+\.sql$/.exec(name);
  if(!match)throw Error('MIGRATION_NAME_INVALID:'+name);
  if(seen.has(match[1]))throw Error('MIGRATION_NUMBER_COLLISION:'+seen.get(match[1])+':'+name);
  seen.set(match[1],name);
 }
 return seen;
}
test('canonical Core history has unique numeric migration IDs and verified checksums',()=>{
 const entries=readMigrations(path.join(root,'db/migrations'),path.join(root,'db/migrations.sha256'));
 assert.ok(entries.length>=132,'Published 0.19 history must not be discarded');
 assert.equal(uniqueNumbers(entries.map(x=>x.name)).size,entries.length);
 const baseline=entries.slice(0,132).map(x=>`${x.sha256}  ${x.name}\n`).join('');
 // Snapshot of migrations 1–132 recorded at published 0.19 / f75d817.
 // New fixes append migrations; rewriting an existing manifest alongside SQL is rejected.
 assert.equal(createHash('sha256').update(baseline).digest('hex'),'90a929ec43f7881469746c854000b35a7a1e0148fe65a379148e3769640b6605','MIGRATION_BASELINE_REWRITTEN');
});
test('different filenames cannot reuse one numeric migration ID',()=>{
 assert.throws(()=>uniqueNumbers(['0008_guest_booking_access.sql','0008_guest_stays.sql']),/MIGRATION_NUMBER_COLLISION/);
 assert.throws(()=>uniqueNumbers(['0035_provider_egress_audit.sql','0035_market_service_order_foundation.sql']),/MIGRATION_NUMBER_COLLISION/);
 assert.throws(()=>uniqueNumbers(['unversioned.sql']),/MIGRATION_NAME_INVALID/);
 assert.equal(uniqueNumbers(['0130_supply_temporal_queue_indexes.sql','0131_future_correction.sql']).size,2);
});
test('an old apps/api/db migration root cannot silently re-enter the workspace',()=>{
 const legacy=path.join(root,'apps/api/db/migrations');
 const files=fs.existsSync(legacy)?fs.readdirSync(legacy).filter(x=>x.endsWith('.sql')):[];
 assert.deepEqual(files,[],'LEGACY_CORE_MIGRATION_ROOT_REINTRODUCED: map reviewed changes into new canonical migrations instead');
});
