'use strict';
const fs=require('node:fs'),path=require('node:path');
const {createHash}=require('node:crypto');
function readMigrations(directory,manifest){
 const lines=fs.readFileSync(manifest,'utf8').trim().split('\n');
 const entries=lines.map(line=>{
  const match=/^([a-f0-9]{64})  (\d{4}_[a-z0-9_]+\.sql)$/.exec(line);
  if(!match)throw Error('MIGRATION_MANIFEST_INVALID');return {name:match[2],sha256:match[1]};
 });
 const names=entries.map(x=>x.name);
 const files=fs.readdirSync(directory).filter(x=>x.endsWith('.sql')).sort();
 if(new Set(names).size!==names.length||JSON.stringify(names)!==JSON.stringify(files))throw Error('MIGRATION_MANIFEST_FILES_CHANGED');
 return entries.map(entry=>{
  const sql=fs.readFileSync(path.join(directory,entry.name),'utf8');
  if(createHash('sha256').update(sql).digest('hex')!==entry.sha256)throw Error('MIGRATION_CHECKSUM_CHANGED:'+entry.name);
  if(!/^(?:\s|--[^\r\n]*(?:\r?\n|$))*BEGIN;/.test(sql)||!/COMMIT;\s*$/.test(sql))throw Error('MIGRATION_TRANSACTION_REQUIRED:'+entry.name);
  return {...entry,sql};
 });
}
// Caller owns the advisory lock and DB scope; each SQL + checksum is atomic.
async function applyMigrations(client,migrations){
 await client.query('CREATE TABLE IF NOT EXISTS public.views_local_migrations(name text PRIMARY KEY, sha256 text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())');
 const history=(await client.query('SELECT name,sha256 FROM public.views_local_migrations')).rows;
 const known=new Map(migrations.map(m=>[m.name,m]));
 for(const prior of history){
  if(!known.has(prior.name))throw Error('MIGRATION_HISTORY_UNKNOWN:'+prior.name);
  if(known.get(prior.name).sha256!==prior.sha256)throw Error('MIGRATION_CHECKSUM_CHANGED:'+prior.name);
 }
 const applied=new Set(history.map(m=>m.name));let count=0;
 for(const migration of migrations){
  if(applied.has(migration.name))continue;
  try{
   await client.query(migration.sql.replace(/COMMIT;\s*$/,''));
   await client.query('INSERT INTO public.views_local_migrations(name,sha256) VALUES($1,$2)',[migration.name,migration.sha256]);
   await client.query('COMMIT');count++;
  }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}
 }
 return count;
}
module.exports={readMigrations,applyMigrations};
