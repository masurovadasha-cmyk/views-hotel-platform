'use strict';
/** Restore proof helpers, shared by operator command and disposable CI. */
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const {createHash,randomBytes}=require('node:crypto');
const {compareTableManifests}=require('../../../scripts/windows-local-rollout-safety.cjs');
async function tableManifest(client){
 await client.query("SET LOCAL TimeZone='UTC'; SET LOCAL DateStyle='ISO, YMD'");
 const tables=(await client.query("SELECT schemaname AS schema,tablename AS table FROM pg_tables WHERE schemaname IN ('public','staff_private') ORDER BY 1,2")).rows;
 const out=[];
 for(const item of tables){
  if(!/^(public|staff_private)$/.test(item.schema)||!/^[a-z0-9_]+$/.test(item.table))throw Error('UNSAFE_TABLE_NAME');
  const q='"'+item.schema+'"."'+item.table+'"';
  const r=(await client.query(`SELECT count(*)::int count,md5(string_agg(d,',' ORDER BY d)) digest
   FROM (SELECT md5(row_to_json(t)::text) d FROM ${q} t) s`)).rows[0];
  out.push({...item,count:r.count,digest:r.digest});
 }
 return out;
}
function pgCommand(exe,args,env){
 const r=spawnSync(exe,args,{env,encoding:'utf8',windowsHide:true,shell:false,timeout:300000,maxBuffer:4*1024*1024});
 if(r.error||r.status!==0)throw Error('BACKUP_COMMAND_FAILED:'+path.basename(exe)+':'+(r.status??'SPAWN'));
}
async function backupRestoreProof({Client,connection,pgBin,directory}){
 const suffix=Date.now()+'_'+randomBytes(4).toString('hex'),temporary='views_stage731_restore_'+suffix;
 const file=path.join(directory,'stage731-pre-'+suffix+'.dump'),ext=process.platform==='win32'?'.exe':'';
 const args=['-h',connection.host,'-p',String(connection.port),'-U',connection.user];
 const env={...process.env,PGPASSWORD:connection.password||'',PGCONNECT_TIMEOUT:'5',PGCONNECTTIMEOUT:'5',PGCLIENTENCODING:'UTF8'};
 const source=new Client(connection),admin=new Client({...connection,database:'postgres'});let restored,created=false,transaction=false;
 try{
  await source.connect();await admin.connect();
  await source.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');transaction=true;
  const snap=(await source.query('SELECT pg_export_snapshot() AS snapshot')).rows[0].snapshot;
  if(!/^[a-f0-9-]+$/i.test(snap))throw Error('BACKUP_SNAPSHOT_INVALID');
  const before=await tableManifest(source);
  // Both the source manifest and pg_dump read exactly the same MVCC snapshot.
  pgCommand(path.join(pgBin,'pg_dump'+ext),[...args,'-d',connection.database,'-Fc','--snapshot='+snap,'-f',file],env);
  await source.query('COMMIT');transaction=false;
  await admin.query('CREATE DATABASE "'+temporary+'"');created=true;
  pgCommand(path.join(pgBin,'pg_restore'+ext),[...args,'-d',temporary,'--exit-on-error','--no-owner','--no-privileges',file],env);
  restored=new Client({...connection,database:temporary});await restored.connect();
  await restored.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const after=await tableManifest(restored);await restored.query('COMMIT');
  const comparison=compareTableManifests(before,after);if(!comparison.ok)throw Error(comparison.errors.join(','));
  return {file:path.basename(file),sha256:createHash('sha256').update(fs.readFileSync(file)).digest('hex'),bytes:fs.statSync(file).size,
   tableCount:comparison.tableCount,privateTableCount:comparison.privateTableCount,contentDigestMatch:true,
   sameExportedSnapshot:true,privilegesAndGlobalRolesRestored:false};
 }finally{
  if(transaction)await source.query('ROLLBACK').catch(()=>{});
  if(restored)await restored.end().catch(()=>{});
  if(created)await admin.query('DROP DATABASE "'+temporary+'"').catch(()=>{});
  await admin.end().catch(()=>{});await source.end().catch(()=>{});
 }
}
module.exports={tableManifest,backupRestoreProof};
