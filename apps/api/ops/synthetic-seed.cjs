'use strict';
const {createHash}=require('node:crypto');
// Trusted repository SQL only. The caller supplies a disposable test connection.
async function applySyntheticSeed(client,name,sql){
 if(!/^[a-z0-9][a-z0-9.-]{0,100}$/.test(name))throw Error('SEED_NAME_INVALID');
 const sha256=createHash('sha256').update(sql).digest('hex');
 const start=/^((?:\s|--[^\r\n]*(?:\r?\n|$))*)BEGIN;/;
 const end=/COMMIT;\s*$/;
 if(start.test(sql)!==end.test(sql))throw Error('SEED_TRANSACTION_INVALID');
 const body=sql.replace(start,'$1').replace(end,'');
 await client.query('BEGIN');
 try{
  const scope=(await client.query(`SELECT current_database()='views' AND
   shobj_description((SELECT oid FROM pg_database WHERE datname=current_database()),'pg_database')='VIEWS_DISPOSABLE_CORE_TEST' AS allowed`)).rows[0];
  if(scope.allowed!==true)throw Error('DISPOSABLE_DATABASE_REQUIRED');
  await client.query("SELECT pg_advisory_xact_lock(hashtext('views_synthetic_seed'))");
  await client.query('CREATE SCHEMA IF NOT EXISTS seed_private; REVOKE ALL ON SCHEMA seed_private FROM PUBLIC');
  await client.query('CREATE TABLE IF NOT EXISTS seed_private.applied(name text PRIMARY KEY,sha256 text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())');
  const prior=(await client.query('SELECT sha256 FROM seed_private.applied WHERE name=$1',[name])).rows[0];
  if(prior){
   if(prior.sha256!==sha256)throw Error('SEED_CHECKSUM_CHANGED:'+name);
   await client.query('COMMIT');return false;
  }
  await client.query(body);
  await client.query('INSERT INTO seed_private.applied(name,sha256) VALUES($1,$2)',[name,sha256]);
  await client.query('COMMIT');return true;
 }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}
}
module.exports={applySyntheticSeed};
