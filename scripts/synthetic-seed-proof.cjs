'use strict';
const assert=require('node:assert/strict');
const {applySyntheticSeed}=require('../apps/api/ops/synthetic-seed.cjs');
module.exports=async function seedProof(client,peer){
 const before=(await client.query('SELECT * FROM seed_private.applied ORDER BY name')).rows;
 assert.equal(before.length,7);
 await assert.rejects(applySyntheticSeed(client,before[0].name,'SELECT 1'),/SEED_CHECKSUM_CHANGED/);
 assert.deepEqual((await client.query('SELECT * FROM seed_private.applied ORDER BY name')).rows,before);
 await client.query("COMMENT ON DATABASE views IS 'UNMARKED'");
 try{
  await assert.rejects(applySyntheticSeed(client,'guard-probe','CREATE TABLE public.seed_guard_probe(id int)'),/DISPOSABLE_DATABASE_REQUIRED/);
  assert.equal((await client.query("SELECT to_regclass('public.seed_guard_probe') AS name")).rows[0].name,null);
 }finally{await client.query("COMMENT ON DATABASE views IS 'VIEWS_DISPOSABLE_CORE_TEST'");}
 await assert.rejects(applySyntheticSeed(client,'rollback-probe',
  'CREATE TABLE public.seed_rollback_probe(id int); SELECT nonexistent_seed_function();'));
 assert.equal((await client.query("SELECT to_regclass('public.seed_rollback_probe') AS name")).rows[0].name,null);
 assert.equal((await client.query("SELECT count(*)::int AS n FROM seed_private.applied WHERE name='rollback-probe'")).rows[0].n,0);
 const sql='CREATE TABLE seed_private.race_probe(id int PRIMARY KEY); INSERT INTO seed_private.race_probe VALUES(1)';
 const results=await Promise.all([applySyntheticSeed(client,'race-probe',sql),applySyntheticSeed(peer,'race-probe',sql)]);
 assert.deepEqual(results.sort(),[false,true]);
 assert.equal((await client.query('SELECT count(*)::int AS n FROM seed_private.race_probe')).rows[0].n,1);
 assert.equal(await applySyntheticSeed(peer,'race-probe',sql),false);
 const visibility=await client.query("SELECT has_schema_privilege('views_app','seed_private','USAGE') AS allowed");
 assert.equal(visibility.rows[0].allowed,false);
 console.log('Synthetic seed: seven replays, checksum guard, unmarked DB rejection, rollback, concurrent exactly-once and private ledger PASS.');
};
