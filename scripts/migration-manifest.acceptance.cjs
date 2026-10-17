'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createHash}=require('node:crypto');
const {readMigrations}=require('../apps/api/ops/migrations.cjs');
test('manifest accepts leading SQL comments, rejects changed/missing files and nontransactional SQL',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'views-manifest-test-'));
 const file=path.join(dir,'0001_fixture.sql'),manifest=path.join(dir,'checksums');
 const write=sql=>{fs.writeFileSync(file,sql);fs.writeFileSync(manifest,createHash('sha256').update(sql).digest('hex')+'  0001_fixture.sql\n');};
 try{
  write('-- explanation\nBEGIN; SELECT 1; COMMIT;\n');assert.equal(readMigrations(dir,manifest).length,1);
  fs.appendFileSync(file,'-- changed');assert.throws(()=>readMigrations(dir,manifest),/MIGRATION_CHECKSUM_CHANGED/);
  write('-- BEGIN;\nSELECT 1; COMMIT;');assert.throws(()=>readMigrations(dir,manifest),/MIGRATION_TRANSACTION_REQUIRED/);
  write('BEGIN; SELECT 1;');assert.throws(()=>readMigrations(dir,manifest),/MIGRATION_TRANSACTION_REQUIRED/);
  write('BEGIN; COMMIT;');fs.unlinkSync(file);assert.throws(()=>readMigrations(dir,manifest),/MIGRATION_MANIFEST_FILES_CHANGED/);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
