'use strict';
// Read-only consistent backup of the owned local fixture; restore into a new disposable container.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {randomBytes,createHash}=require('node:crypto'),{spawnSync}=require('node:child_process');
const {Client}=require('../apps/api/node_modules/pg');
const {localState}=require('../apps/api/ops/local-state.cjs');
const {openSyntheticDocument,SYNTHETIC_VAULT}=require('../apps/api/dist/compliance/synthetic-document-vault.js');
const IMAGE='postgres@sha256:0ea6700a3b4f0ae6ce746519073558aed4d88a79d8d07622a9a644946c7319c4';
function docker(args,buffer=false){const r=spawnSync('docker',args,{encoding:buffer?undefined:'utf8',timeout:60000,maxBuffer:64*1024*1024});if(r.status!==0)throw Error('RESTORE_COMMAND_FAILED');return r.stdout;}
(async()=>{
 assert.equal(process.argv[2],'--ack=LOCAL_SYNTHETIC_RESTORE');
 const {root,privateDir,scope}=localState(),config=JSON.parse(fs.readFileSync(path.join(privateDir,'runtime.json'),'utf8'));
 assert.equal(config.scope,scope);assert.match(config.documentVaultKey,/^[a-f0-9]{64}$/);
 const sourceName='views-local-'+createHash('sha256').update(root).digest('hex').slice(0,12);
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'views-restore-')),name='views-restore-'+randomBytes(8).toString('hex'),password=randomBytes(32).toString('hex');
 const source=new Client({host:'127.0.0.1',port:55432,database:'views_local',user:'views_owner',password:config.ownerPassword,connectionTimeoutMillis:5000});
 let restored,created=false;await source.connect();
 try{
  await source.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  assert.equal((await source.query("SELECT legal_name FROM organizations WHERE id='74240000-0000-4000-8000-000000000001'")).rows[0]?.legal_name,'VIEWS LOCAL WORKSPACE FIXTURE');
  const snapshot=(await source.query('SELECT pg_export_snapshot() snapshot')).rows[0].snapshot;
  const backupDir=path.join(root,'backups');fs.mkdirSync(backupDir,{recursive:true,mode:0o700});
  const backup=path.join(backupDir,'verified-local-'+Date.now()+'.dump');
  fs.writeFileSync(backup,docker(['exec',sourceName,'pg_dump','-U','views_owner','-d','views_local','--snapshot='+snapshot,'-Fc'],true),{mode:0o600,flag:'wx'});
  fs.writeFileSync(path.join(dir,'password'),password,{mode:0o600});
  docker(['run','--detach','--rm','--name',name,'--label','views.disposable-local-restore=true','--publish','127.0.0.1::5432','--mount',`type=bind,src=${path.join(dir,'password')},dst=/run/password,readonly`,'--mount',`type=bind,src=${backup},dst=/restore.dump,readonly`,'--env','POSTGRES_DB=views_restored','--env','POSTGRES_USER=views_owner','--env','POSTGRES_PASSWORD_FILE=/run/password',IMAGE]);created=true;
  const binding=JSON.parse(docker(['inspect',name]))[0].NetworkSettings.Ports['5432/tcp'][0];assert.equal(binding.HostIp,'127.0.0.1');
  for(let i=0;i<60;i++){
   const candidate=new Client({host:'127.0.0.1',port:Number(binding.HostPort),database:'views_restored',user:'views_owner',password,connectionTimeoutMillis:1000});
   try{await candidate.connect();restored=candidate;break;}catch{await candidate.end().catch(()=>{});await new Promise(r=>setTimeout(r,500));}
  }
  assert.ok(restored,'RESTORED_POSTGRES_NOT_READY');
  const roles=(await source.query("SELECT rolname FROM pg_roles WHERE rolname LIKE 'views_%' AND rolname<>'views_owner'")).rows;
  for(const {rolname} of roles)await restored.query('CREATE ROLE "'+rolname.replaceAll('"','""')+'" NOLOGIN');
  docker(['exec',name,'pg_restore','-U','views_owner','-d','views_restored','--exit-on-error','/restore.dump']);
  const tables=(await source.query("SELECT schemaname,tablename FROM pg_tables WHERE schemaname IN ('public','staff_private','guest_identity_private') ORDER BY 1,2")).rows;
  for(const t of tables){
   const quoted='"'+t.schemaname.replaceAll('"','""')+'"."'+t.tablename.replaceAll('"','""')+'"';
   const sql=`SELECT count(*)::int n,md5(string_agg(d,',' ORDER BY d)) digest FROM (SELECT md5(row_to_json(t)::text) d FROM ${quoted} t) s`;
   assert.deepEqual((await restored.query(sql)).rows,(await source.query(sql)).rows,'RESTORE_CONTENT_MISMATCH');
  }
  const docs=(await restored.query('SELECT d.id,d.organization_id,d.reservation_guest_id,d.encrypted_fields,d.object_checksum_sha256,g.reservation_id FROM guest_document_records d JOIN reservation_guests g ON g.id=d.reservation_guest_id WHERE d.vault_id=$1',[SYNTHETIC_VAULT])).rows;assert.ok(docs.length>0,'NONEMPTY_ENCRYPTED_RESTORE_REQUIRED');
  for(const d of docs){const binding={organizationId:d.organization_id,reservationId:d.reservation_id,guestId:d.reservation_guest_id,documentId:d.id};assert.ok(openSyntheticDocument(binding,config.documentVaultKey,d.encrypted_fields,d.object_checksum_sha256).includes('SYNTHETIC TEST FILE'));assert.throws(()=>openSyntheticDocument(binding,'0'.repeat(64),d.encrypted_fields,d.object_checksum_sha256));}
  const turnovers=(await restored.query('SELECT count(*)::int n FROM local_stay_turnovers')).rows[0].n;assert.ok(turnovers>0,'NONEMPTY_TURNOVER_RESTORE_REQUIRED');
  const report={result:'pass',sourceCommit:spawnSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).stdout.trim(),sourceDirty:!!spawnSync('git',['status','--porcelain'],{encoding:'utf8'}).stdout.trim(),tables:tables.length,privateTables:tables.filter(t=>['staff_private','guest_identity_private'].includes(t.schemaname)).length,encryptedDocuments:docs.length,turnovers,separateKeyRequired:true,allTableDigestsMatch:true,sourceModified:false,rolePasswordsRestored:false,productionRestore:false,checkedAt:new Date().toISOString()};
  fs.writeFileSync(path.join(root,'evidence/local-restore.json'),JSON.stringify(report,null,2),{mode:0o600});console.log(JSON.stringify(report));
 }finally{
  await source.query('ROLLBACK').catch(()=>{});await source.end();if(restored)await restored.end();
  if(created)docker(['stop','--time','10',name]);fs.rmSync(dir,{recursive:true,force:true});
 }
})().catch(()=>{console.error('LOCAL_RESTORE_PROOF_FAILED');process.exitCode=1;});
