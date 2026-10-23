'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const {randomBytes,createHash}=require('node:crypto');
const REPO=path.resolve(__dirname,'..');
const {readMigrations,applyMigrations}=require('../apps/api/ops/migrations.cjs');
const {Client}=require(path.join(REPO,'apps/api/node_modules/pg'));
const name='views-migration-proof-'+randomBytes(6).toString('hex');
const password=randomBytes(24).toString('hex');
const clients=[];let created=false;
function docker(args){
 const r=spawnSync('docker',args,{encoding:'utf8',timeout:120000,env:{...process.env,POSTGRES_PASSWORD:password}});
 if(r.error||r.status!==0)throw Error('DOCKER_PROOF_FAILED:'+args[0]);return r.stdout;
}
(async()=>{
 try{
  const migrations=readMigrations(path.join(REPO,'db/migrations'),path.join(REPO,'db/migrations.sha256'));
  assert.equal(migrations.length,132,'Update the checkpoint deliberately when adding migrations');
  docker(['run','-d','--name',name,'--publish','127.0.0.1::5432','--env','POSTGRES_PASSWORD',
   'postgres@sha256:0ea6700a3b4f0ae6ce746519073558aed4d88a79d8d07622a9a644946c7319c4']);created=true;
  const binding=JSON.parse(docker(['inspect',name]))[0].NetworkSettings.Ports['5432/tcp'][0];
  assert.equal(binding.HostIp,'127.0.0.1');
  const options={host:'127.0.0.1',port:Number(binding.HostPort),user:'postgres',password};
  let admin;
  for(let i=0;i<40;i++){
   const candidate=new Client({...options,database:'postgres'});
   try{await candidate.connect();admin=candidate;clients.push(admin);break;}
   catch{await candidate.end().catch(()=>{});await new Promise(r=>setTimeout(r,500));}
  }
  assert.ok(admin,'Temporary PostgreSQL must be ready');
  await admin.query('CREATE ROLE views_app NOLOGIN NOSUPERUSER NOBYPASSRLS');
  for(const database of ['views_m0_clean','views_m0_upgrade']){
   await admin.query('CREATE DATABASE '+database);
   const c=new Client({...options,database});await c.connect();clients.push(c);
   await c.query(fs.readFileSync(path.join(REPO,'infra/postgres/init/001_extensions.sql'),'utf8'));
  }
  const [,clean,upgrade]=clients;
  assert.equal(await applyMigrations(clean,migrations),132);
  assert.equal(await applyMigrations(upgrade,migrations.slice(0,46)),46);
  await upgrade.query(`INSERT INTO organizations(id,type,legal_name,country_code,default_currency,timezone)
   VALUES('a0000000-0000-4000-8000-000000000001','platform','SYNTHETIC upgrade canary','UZ','UZS','Asia/Tashkent')`);
  const before=(await upgrade.query('SELECT to_jsonb(o) AS value FROM organizations o')).rows;
  assert.equal(await applyMigrations(upgrade,migrations.slice(0,130)),84);
  // Exercise the published 0.18 checkpoint before the additive cancellation fix.
  assert.equal(await applyMigrations(upgrade,migrations.slice(0,131)),1);
  assert.equal(await applyMigrations(upgrade,migrations),1);
  assert.deepEqual((await upgrade.query('SELECT to_jsonb(o) AS value FROM organizations o')).rows,before);
  const history=(await upgrade.query('SELECT * FROM views_local_migrations ORDER BY name')).rows;
  assert.equal(await applyMigrations(upgrade,migrations),0);
  assert.deepEqual((await upgrade.query('SELECT * FROM views_local_migrations ORDER BY name')).rows,history);
  const dump=db=>docker(['exec',name,'pg_dump','-U','postgres','--schema-only','--no-owner',db])
   .split('\n').filter(line=>!/^\\(?:un)?restrict /.test(line)).join('\n');
  assert.equal(dump('views_m0_clean'),dump('views_m0_upgrade'));
  await upgrade.query("UPDATE views_local_migrations SET sha256='tampered' WHERE name=$1",[migrations[0].name]);
  await assert.rejects(applyMigrations(upgrade,migrations),/MIGRATION_CHECKSUM_CHANGED/);
  await upgrade.query('UPDATE views_local_migrations SET sha256=$1 WHERE name=$2',[migrations[0].sha256,migrations[0].name]);
  await assert.rejects(applyMigrations(upgrade,migrations.slice(1)),/MIGRATION_HISTORY_UNKNOWN/);
  const sql="BEGIN; CREATE TABLE rollback_probe(id int); SELECT nonexistent_migration_function(); COMMIT;";
  const broken={name:'0133_synthetic_failure.sql',sql,sha256:createHash('sha256').update(sql).digest('hex')};
  await assert.rejects(applyMigrations(upgrade,[...migrations,broken]));
  assert.equal((await upgrade.query("SELECT to_regclass('rollback_probe') AS table_name")).rows[0].table_name,null);
  assert.equal((await upgrade.query('SELECT count(*)::int AS n FROM views_local_migrations')).rows[0].n,132);
  console.log(JSON.stringify({result:'pass',migrations:132,upgradeFrom:46,intermediateCheckpoint:131,appliedOnUpgrade:86,appliedFromCheckpoint:1,
   organizationPreserved:true,schemaEquivalent:true,replayNoop:true,checksumMismatchRejected:true,
   missingHistoryRejected:true,failedMigrationRolledBack:true,persistentDatabaseTouched:false}));
 }finally{
  await Promise.all(clients.map(c=>c.end()));
  if(created)docker(['rm','-f','-v',name]);
 }
})().catch(error=>{console.error(error.message);process.exitCode=1;});
