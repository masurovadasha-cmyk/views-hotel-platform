'use strict';
// Only the explicitly marked disposable fixture; backups never enter artifacts.
const assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
const {Pool}=require('../apps/api/node_modules/pg');
const {deriveToken}=require('../apps/api/ops/staff-mail.cjs');
module.exports=async function restoreProof({owner,ownerURL,keys}){
 const container=process.env.VIEWS_MAIL_TEST_CONTAINER;assert.ok(/^[a-zA-Z0-9_-]+$/.test(container||''),'DISPOSABLE_CONTAINER_REQUIRED');
 function docker(args){const r=spawnSync('docker',args,{encoding:'utf8',timeout:60000});assert.equal(r.status,0,'DISPOSABLE_RESTORE_COMMAND_FAILED');return r.stdout;}
 const marker=docker(['exec',container,'psql','-U','views_owner','-d','views_local','-Atc',"SELECT shobj_description(oid,'pg_database') FROM pg_database WHERE datname=current_database()"]);
 assert.equal(marker.trim(),'VIEWS_DISPOSABLE_STAFF_MAIL');
 docker(['exec',container,'pg_dump','-U','views_owner','-d','views_local','-Fc','-f','/tmp/mail-proof.dump']);
 docker(['exec',container,'createdb','-U','views_owner','views_mail_restore']);
 docker(['exec',container,'pg_restore','-U','views_owner','-d','views_mail_restore','--exit-on-error','/tmp/mail-proof.dump']);
 const restored=new Pool({connectionString:ownerURL.replace(/views_local$/,'views_mail_restore')});
 try{
  const tables=(await owner.query("SELECT schemaname,tablename FROM pg_tables WHERE schemaname IN ('public','staff_private') ORDER BY 1,2")).rows;
  assert.ok(tables.some(t=>t.schemaname==='staff_private'&&t.tablename==='credentials'));
  for(const t of tables){const quoted='"'+t.schemaname.replaceAll('"','""')+'"."'+t.tablename.replaceAll('"','""')+'"';
   const sql=`SELECT count(*)::int n,md5(string_agg(d,',' ORDER BY d)) digest FROM (SELECT md5(row_to_json(t)::text) d FROM ${quoted} t) s`;
   assert.deepEqual((await restored.query(sql)).rows,(await owner.query(sql)).rows,'RESTORED_TABLE_MISMATCH:'+t.schemaname+'.'+t.tablename);
  }
  const jobs=(await restored.query('SELECT * FROM staff_private.mail_jobs ORDER BY id')).rows;assert.ok(jobs.length>0);
  for(const job of jobs){const original=(await owner.query('SELECT * FROM staff_private.mail_jobs WHERE id=$1',[job.id])).rows[0];assert.equal(deriveToken(job,keys),deriveToken(original,keys));assert.ok(!JSON.stringify(job).includes(keys.fixture));}
  // The keyring stays only in the calling process; PostgreSQL restore alone cannot issue links.
  assert.throws(()=>deriveToken(jobs[0],{}));
  return {tables:tables.length,privateTables:tables.filter(t=>t.schemaname==='staff_private').length,separateKeyring:true};
 }finally{await restored.end();}
};
