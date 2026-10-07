'use strict';
// Disposable CI database + loopback SMTP only. No cloud mailbox or real account.
const fs=require('node:fs'),path=require('node:path'),net=require('node:net'),assert=require('node:assert/strict');
const {spawn,spawnSync}=require('node:child_process'),{randomUUID,randomBytes}=require('node:crypto');
const API=path.resolve(__dirname,'../apps/api'),{Pool}=require(path.join(API,'node_modules/pg'));
const mail=require(path.join(API,'ops/staff-mail.cjs'));
const ORG='74260000-0000-4000-8000-000000000001',OTHER='74260000-0000-4000-8000-000000000002';
const ownerURL='postgresql://views_owner:fixture-owner@127.0.0.1:55432/views_local';
const runtimeURL='postgresql://views_app:fixture-runtime@127.0.0.1:55432/views_local';
const workerURL='postgresql://views_mailer:fixture-mailer@127.0.0.1:55432/views_local';
const internalKey=randomBytes(32).toString('hex'),keys={fixture:randomBytes(32).toString('hex')};
const checks=[],messages=[],sockets=new Set();let child,server,owner,runtime,worker,current='setup',httpCalls=0,transport;
const env={NODE_ENV:'test',VIEWS_LOCAL_REHEARSAL:'true'};
const config={version:1,transport:'capture',keyId:'fixture',keys,origin:'http://127.0.0.1:4173',from:'staff@views.invalid',allowedRecipients:[],smtpHost:'127.0.0.1',smtpPort:1};
const password='Isolated email proof '+randomBytes(12).toString('hex');
async function check(name,fn){current=name;await fn();checks.push(name);process.stderr.write('PASS '+name+'\n');}
async function rpc(route,body,token){
 const headers={'content-type':'application/json','x-views-service-id':'local-workspace','x-views-internal-key':internalKey,'x-request-id':randomUUID()};
 if(token)headers['x-views-staff-session']=token;
 const response=await fetch('http://127.0.0.1:3001/v1/staff-auth/'+route,{method:body===undefined?'GET':'POST',headers,
 body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(12000)});httpCalls++;
 return {status:response.status,body:await response.json()};
}
async function staff(org=ORG){
 const user=randomUUID(),member=randomUUID(),email='mail-'+randomBytes(6).toString('hex')+'@views.invalid';
 await owner.query("INSERT INTO users(id,email,display_name,status) VALUES($1,$2,'Mail fixture','active')",[user,email]);
 await owner.query("INSERT INTO organization_memberships(id,organization_id,user_id,role_id,status) SELECT $1,$2,$3,id,'invited' FROM roles WHERE code='front_desk'",[member,org,user]);
 return {org,user,member,email,config:{...config,allowedRecipients:[email]}};
}
async function enqueue(f,purpose='invite',requestId=randomUUID()){
 const result=await mail.enqueueMail(owner,{organizationId:f.org,membershipId:f.member,requestId,purpose,recipient:f.email},f.config);
 const job=(await owner.query('SELECT * FROM staff_private.mail_jobs WHERE id=$1',[result.jobId])).rows[0];
 return {result,job,requestId,token:mail.deriveToken(job,keys)};
}
async function claim(f){return (await worker.query('SELECT * FROM staff_mail_ops.claim($1,$2)',[f.org,f.config.transport])).rows[0];}
async function send(f){const t=mail.smtpTransport(f.config,env);try{return await mail.deliverOne(worker,f.org,f.config,t);}finally{t.close();}}
function decodedText(raw){
 const marker=raw.indexOf('\r\n\r\n'),headers=raw.slice(0,marker),body=raw.slice(marker+4);
 if(/Content-Transfer-Encoding: base64/i.test(headers))return Buffer.from(body.replace(/\s/g,''),'base64').toString('utf8');
 if(/Content-Transfer-Encoding: quoted-printable/i.test(headers)){
   const s=body.replace(/=\r?\n/g,''),bytes=[];for(let i=0;i<s.length;i++){if(s[i]==='='&&/^[a-f0-9]{2}$/i.test(s.slice(i+1,i+3))){bytes.push(parseInt(s.slice(i+1,i+3),16));i+=2;}else bytes.push(s.charCodeAt(i));}return Buffer.from(bytes).toString('utf8');
 }
 return body;
}
async function smtpFixture(){
 server=net.createServer(socket=>{
  sockets.add(socket);socket.on('close',()=>sockets.delete(socket));socket.on('error',()=>{});socket.setTimeout(15000,()=>socket.destroy());
  socket.write('220 views.invalid local capture\r\n');let buffer='',data=false,body='',recipient='';
  socket.on('data',chunk=>{
   buffer+=chunk.toString('utf8');if(buffer.length+body.length>131072){socket.destroy();return;}
   while(buffer.includes('\r\n')){
    const at=buffer.indexOf('\r\n'),line=buffer.slice(0,at);buffer=buffer.slice(at+2);
    if(data){if(line==='.'){
      messages.push({recipient,raw:body});body='';data=false;socket.write('250 2.0.0 captured locally\r\n');
     }else body+=line.replace(/^\.\./,'.')+'\r\n';continue;}
    if(/^EHLO|^HELO/i.test(line))socket.write('250-views.invalid\r\n250 SIZE 65536\r\n');
    else if(/^MAIL FROM:/i.test(line))socket.write('250 OK\r\n');
    else if(/^RCPT TO:/i.test(line)){recipient=line.match(/<([^>]+)>/)?.[1]||'';socket.write(recipient.endsWith('@views.invalid')?'250 OK\r\n':'550 fixture recipients only\r\n');}
    else if(/^DATA$/i.test(line)){data=true;socket.write('354 End with dot\r\n');}
    else if(/^QUIT$/i.test(line))socket.end('221 Bye\r\n');
    else if(/^RSET|^NOOP/i.test(line))socket.write('250 OK\r\n');else socket.write('500 command unsupported\r\n');
   }
  });
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});config.smtpPort=server.address().port;
}
async function setup(){
 assert.equal(process.env.VIEWS_MAIL_PROOF_ACK,'DISPOSABLE_MAIL_ONLY');
 assert.equal(process.env.STAFF_MAIL_PROOF_OWNER_URL,ownerURL);
 owner=new Pool({connectionString:ownerURL,max:4});
 assert.equal((await owner.query("SELECT shobj_description(oid,'pg_database') AS marker FROM pg_database WHERE datname=current_database()")).rows[0].marker,'VIEWS_DISPOSABLE_STAFF_MAIL','DISPOSABLE_DATABASE_MARKER_REQUIRED');
 await owner.query("CREATE ROLE views_app LOGIN PASSWORD 'fixture-runtime' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS; CREATE ROLE views_mailer LOGIN PASSWORD 'fixture-mailer' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;");
 await owner.query('GRANT CONNECT ON DATABASE views_local TO views_app,views_mailer; GRANT USAGE ON SCHEMA public,app TO views_app; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO views_app; GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO views_app; GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO views_app; REVOKE INSERT,UPDATE,DELETE ON provider_egress_attempts,provider_egress_reconciliation_queue FROM views_app; GRANT USAGE ON SCHEMA staff_mail_ops TO views_mailer; GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA staff_mail_ops TO views_mailer');
 runtime=new Pool({connectionString:runtimeURL,max:4});worker=new Pool({connectionString:workerURL,max:8});
 for(const org of [ORG,OTHER])await owner.query(`INSERT INTO organizations(id,type,legal_name,display_name,country_code,default_currency,timezone)
 VALUES($1,'host','DISPOSABLE MAIL FIXTURE','{"en":"MAIL TEST"}','UZ','UZS','Asia/Tashkent')`,[org]);
 const childEnv={...process.env,NODE_ENV:'test',VIEWS_ENV:'local-rehearsal',VIEWS_LOCAL_REHEARSAL:'true',PORT:'3001',TRUSTED_PROXY_MODE:'direct',DATABASE_URL:runtimeURL,
 VIEWS_INTERNAL_API_KEY:internalKey,VIEWS_INTERNAL_SERVICE_AUTH_MODES_JSON:'{"local-workspace":"internal_key_only"}',
 VIEWS_INTERNAL_SERVICE_KEYS_JSON:JSON.stringify({'local-workspace':[internalKey]}),VIEWS_INTERNAL_SERVICE_KEY_REFS_JSON:'',VIEWS_INTERNAL_SERVICE_PUBLIC_KEY_REFS_JSON:'{}',
 VIEWS_INTERNAL_SERVICE_SOURCE_CIDRS_JSON:'{"local-workspace":["127.0.0.1/32"]}',VIEWS_TRUSTED_PROXY_CIDRS_JSON:'',
 GUEST_AUTH_RATE_LIMIT_SECRET:randomBytes(32).toString('hex'),VIEWS_STAFF_PASSKEY_PILOT_ENABLED:process.env.VIEWS_PASSKEY_PROOF==='true'?'true':'false',VIEWS_STAFF_AUTH_PILOT_ENABLED:'true',VIEWS_STAFF_AUTH_ORGANIZATION_ID:ORG,VIEWS_PAYME_SANDBOX_ENABLED:'false'};
 child=spawn(process.execPath,[path.join(API,'dist/main.js')],{env:childEnv,cwd:API,stdio:'ignore'});
 let ready=false;for(let i=0;i<50;i++){try{const r=await fetch('http://127.0.0.1:3001/readiness',{signal:AbortSignal.timeout(500)});if(r.ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,200));}
 assert.equal(ready,true,'CORE_NOT_READY');await smtpFixture();
}
(async()=>{
 const report={schemaVersion:1,stage:process.env.VIEWS_PASSKEY_PROOF==='true'?'7.27':'7.26',passkeyVirtualAuthenticator:process.env.VIEWS_PASSKEY_PROOF==='true',result:'fail',sourceCommit:spawnSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).stdout.trim(),sourceDirty:spawnSync('git',['status','--porcelain'],{encoding:'utf8'}).stdout.trim().length>0,checks,externalEmailsSent:0,
 externalMailboxOwnershipProven:false,productionEnabled:false,privilegedMfaEnabled:false,hostDeploymentConfirmed:false};
 try{
  await setup();
  const f=await staff(),a=await enqueue(f);
  await check('queue_idempotency_and_no_raw_tokens',async()=>{
   const b=await enqueue(f,'invite',a.requestId);assert.equal(a.result.jobId,b.result.jobId);
   assert.ok(!JSON.stringify(a.job).includes(a.token));assert.ok(!JSON.stringify(a.job).includes(keys.fixture));
   assert.equal((await rpc('activate',{token:a.token,password})).status,400);
  });
  await check('parallel_workers_send_one_real_loopback_SMTP_message',async()=>{
   const before=messages.length,results=await Promise.all(Array.from({length:8},()=>send(f)));
   assert.equal(results.filter(x=>x.state==='accepted').length,1);assert.equal(messages.length-before,1);
   const text=decodedText(messages.at(-1).raw);assert.ok(text.includes(a.token));assert.ok(text.includes('#staff-action=activate&token='));
   assert.ok(text.includes('ТЕСТОВОЕ ПИСЬМО'));assert.equal(messages.at(-1).recipient,f.email);
   assert.equal((await owner.query('SELECT count(*)::int n FROM staff_private.credentials WHERE membership_id=$1',[f.member])).rows[0].n,0);
  });
  let sessionToken;
  await check('accepted_mail_not_verified_until_token_use_and_capture_never_verifies_email',async()=>{
   const r=await rpc('activate',{token:a.token,password});assert.equal(r.status,200);assert.equal(r.body.loginRequired,true);
   const login=await rpc('login',{email:f.email,password});assert.equal(login.status,200);sessionToken=login.body.token;
   assert.equal(login.body.identity.emailVerified,false);assert.equal((await rpc('activate',{token:a.token,password})).status,400);
  });
  await check('reset_mail_single_use_revokes_previous_login',async()=>{
   const r=await enqueue(f,'reset');assert.equal((await send(f)).state,'accepted');
   assert.equal((await rpc('reset',{token:r.token,password:password+' reset'})).status,200);
   assert.equal((await rpc('session',undefined,sessionToken)).status,401);
   assert.equal((await rpc('reset',{token:r.token,password})).status,400);
  });
  await check('superseded_mail_never_sends_and_old_token_cannot_activate',async()=>{
   const x=await staff(),old=await enqueue(x),next=await enqueue(x);
   assert.equal((await owner.query('SELECT state FROM staff_private.mail_jobs WHERE id=$1',[old.job.id])).rows[0].state,'cancelled');
   assert.equal((await send(x)).state,'accepted');assert.equal((await rpc('activate',{token:old.token,password})).status,400);
   assert.equal((await rpc('activate',{token:next.token,password})).status,200);
  });
  await check('key_tamper_or_missing_key_is_failure_before_SMTP',async()=>{
   const x=await staff();await enqueue(x);const before=messages.length;
   const r=await mail.deliverOne(worker,ORG,{...x.config,keys:{fixture:randomBytes(32).toString('hex')}},{send:async()=>{throw Error('MUST_NOT_SEND');}});
   assert.equal(r.state,'failed');assert.equal(r.code,'MAIL_TOKEN_BINDING_INVALID');assert.equal(messages.length,before);
  });
  await check('lease_loss_is_uncertain_and_late_worker_cannot_commit_or_redeliver',async()=>{
   const x=await staff(),q=await enqueue(x),claimed=await claim(x);
   await owner.query("UPDATE staff_private.mail_jobs SET lease_until=now()-interval '1 second' WHERE id=$1",[q.job.id]);
   assert.equal((await worker.query("SELECT staff_mail_ops.finish($1,$2,$3,'accepted','LATE_RESULT') AS ok",[ORG,q.job.id,claimed.lease_id])).rows[0].ok,false);
   assert.equal((await send(x)).state,'idle');assert.equal((await owner.query('SELECT state FROM staff_private.mail_jobs WHERE id=$1',[q.job.id])).rows[0].state,'uncertain');
  });
  await check('known_retry_backoff_is_bounded_and_unknown_delivery_is_not_retried',async()=>{
   const x=await staff(),q=await enqueue(x);const before=messages.length;
   for(let i=0;i<3;i++){
    await mail.deliverOne(worker,ORG,x.config,{send:async()=>{const e=Error();e.responseCode=451;throw e;}});
    if(i<2){assert.equal((await send(x)).state,'idle');await owner.query("UPDATE staff_private.mail_jobs SET next_attempt_at=now()-interval '1 second' WHERE id=$1",[q.job.id]);}
   }
   assert.equal((await owner.query('SELECT state FROM staff_private.mail_jobs WHERE id=$1',[q.job.id])).rows[0].state,'failed');assert.equal(messages.length,before);
   const y=await staff(),yq=await enqueue(y);
   const r=await mail.deliverOne(worker,ORG,y.config,{send:async()=>{const e=Error();e.code='ETIMEDOUT';throw e;}});
   assert.equal(r.state,'uncertain');assert.equal((await send(y)).state,'idle');
  });
  await check('email_change_invalidates_bound_token_and_pending_message',async()=>{
   const x=await staff(),q=await enqueue(x);await owner.query('UPDATE users SET email=$2 WHERE id=$1',[x.user,'changed-'+randomUUID()+'@views.invalid']);
   assert.equal((await rpc('activate',{token:q.token,password})).status,400);
   assert.equal((await owner.query('SELECT state FROM staff_private.mail_jobs WHERE id=$1',[q.job.id])).rows[0].state,'cancelled');
  });
  await check('expired_token_and_offboarded_member_are_not_sent',async()=>{
   const x=await staff(),q=await enqueue(x);await owner.query("UPDATE staff_private.activation_tokens SET expires_at=now()-interval '1 second' WHERE token_hash=$1",[q.job.token_hash]);
   assert.equal((await send(x)).state,'idle');assert.equal((await rpc('activate',{token:q.token,password})).status,400);
   const y=await staff();await enqueue(y);await owner.query("UPDATE organization_memberships SET status='suspended' WHERE id=$1",[y.member]);assert.equal((await send(y)).state,'idle');
  });
  await check('offboarding_permanently_revokes_accepted_invitation',async()=>{
   const x=await staff(),q=await enqueue(x);assert.equal((await send(x)).state,'accepted');
   await owner.query("UPDATE organization_memberships SET status='suspended' WHERE id=$1",[x.member]);
   await owner.query("UPDATE organization_memberships SET status='invited' WHERE id=$1",[x.member]);
   assert.equal((await rpc('activate',{token:q.token,password})).status,400);
  });
  await check('finish_rechecks_lease_after_waiting_for_row_lock',async()=>{
   const x=await staff(),q=await enqueue(x),claimed=await claim(x),lock=await owner.connect();
   let result;
   try{
    await owner.query("UPDATE staff_private.mail_jobs SET lease_until=clock_timestamp()+interval '1 second' WHERE id=$1",[q.job.id]);
    await lock.query('BEGIN');await lock.query('SELECT 1 FROM staff_private.mail_jobs WHERE id=$1 FOR UPDATE',[q.job.id]);
    result=worker.query("SELECT staff_mail_ops.finish($1,$2,$3,'accepted','LOCK_WAIT_PROOF') AS ok",[ORG,q.job.id,claimed.lease_id]);
    let waiting=false;
    for(let i=0;i<30;i++){
     waiting=(await owner.query("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND usename='views_mailer' AND wait_event_type='Lock') AS waiting")).rows[0].waiting;
     if(waiting)break;await new Promise(r=>setTimeout(r,10));
    }
    assert.equal(waiting,true,'MAIL_WORKER_DID_NOT_REACH_LOCK');
    await owner.query('SELECT pg_sleep(1.1)');await lock.query('COMMIT');
    assert.equal((await result).rows[0].ok,false);
   }finally{await lock.query('ROLLBACK');lock.release();if(result)await result.catch(()=>{});}
  });
  await check('worker_tenant_filter_and_separation_of_database_privileges',async()=>{
   const x=await staff(OTHER),q=await enqueue(x);assert.equal((await send({config:x.config,org:ORG})).state,'idle');
   for(const pool of [runtime,worker])await assert.rejects(pool.query('SELECT * FROM staff_private.mail_jobs'),e=>e.code==='42501');
   await assert.rejects(runtime.query("SELECT * FROM staff_mail_ops.claim($1,'capture')",[ORG]),e=>e.code==='42501');
   await assert.rejects(worker.query("SELECT staff_private.issue_token($1,'invite',$2,'email')",[x.member,q.job.token_hash]),e=>e.code==='42501');
   assert.equal((await send(x)).state,'accepted');
  });
  await check('SMTP_receipt_simulation_requires_matching_token_before_verified_flag',async()=>{
   // Simulation of an authenticated mailer receipt, NOT an external delivery.
   const x=await staff();x.config={...x.config,transport:'smtp'};const q=await enqueue(x),claimed=await claim(x);
   await worker.query("SELECT staff_mail_ops.finish($1,$2,$3,'accepted','SIMULATED_SMTP_RECEIPT')",[ORG,q.job.id,claimed.lease_id]);
   assert.equal((await owner.query('SELECT count(*)::int n FROM staff_private.credentials WHERE membership_id=$1',[x.member])).rows[0].n,0);
   assert.equal((await rpc('activate',{token:q.token,password})).status,200);
   const login=await rpc('login',{email:x.email,password});assert.equal(login.status,200);assert.equal(login.body.identity.emailVerified,true);
   await owner.query('UPDATE users SET email=$2 WHERE id=$1',[x.user,'new-'+randomUUID()+'@views.invalid']);
   assert.equal((await rpc('session',undefined,login.body.token)).status,401);
   assert.equal((await owner.query('SELECT verified_email FROM staff_private.credentials WHERE membership_id=$1',[x.member])).rows[0].verified_email,null);
  });
  await check('audit_is_safe_and_legacy_local_invitation_cannot_claim_email',async()=>{
   const x=await staff();await assert.rejects(owner.query("SELECT staff_private.issue_token($1,'invite',$2,'email')",[x.member,mail.tokenHash(randomUUID())]),e=>e.code==='P0001');
   const rows=(await owner.query("SELECT after_state FROM audit_log WHERE action IN ('staff.mail_queued','staff.mail_result')")).rows;
   assert.ok(rows.length>5);assert.ok(!JSON.stringify(rows).includes(a.token));assert.ok(!JSON.stringify(rows).includes(password));
   assert.ok(rows.every(r=>!r.after_state?.recipient_email&&!r.after_state?.token));
  });
  await require('./staff-mail.browser.cjs')({owner,staff,enqueue,send,rpc,messages,decodedText,internalKey,ORG,password,check});
  if(process.env.VIEWS_PASSKEY_PROOF==='true')await require('./staff-passkey.browser.cjs')({owner,runtime,worker,staff,enqueue,send,rpc,internalKey,ORG,password,check});
  await check('private_auth_backup_restore_with_separate_keyring',async()=>{report.restore=await require('./staff-mail.restore.cjs')({owner,ownerURL,keys});});
  Object.assign(report,{result:'pass',checkCount:checks.length,httpCalls,smtpMessagesCaptured:messages.length,
   actualSMTPTransportExercised:true,SMTPReceiptPositiveBranchSimulated:true,queueReplaysPrevented:true,
   mailerRuntimeSeparated:true,uncertainDeliveryNotRetried:true,checkedAt:new Date().toISOString(),
   limitations:['SMTP messages received only by disposable loopback test server','Positive external-verification branch uses a simulated mailer receipt','No user workstation deployment or external sender configuration confirmed']});
 }catch(e){report.failure={check:current,code:e.code||'ASSERTION_FAILED'};process.exitCode=1;}
 finally{
  transport?.close();for(const socket of sockets)socket.destroy();if(server)await new Promise(r=>server.close(r));
  if(child&&!child.exitCode){child.kill('SIGTERM');await Promise.race([new Promise(r=>child.once('exit',r)),new Promise(r=>setTimeout(()=>{child.kill('SIGKILL');r();},3000))]);}
  for(const p of [owner,runtime,worker])if(p)await p.end();
 }
 fs.mkdirSync('mail-evidence',{recursive:true});fs.writeFileSync('mail-evidence/integration.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
})().catch(()=>{console.error('MAIL_PROOF_SETUP_FAILED');process.exitCode=1;});
