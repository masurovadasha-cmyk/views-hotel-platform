'use strict';
// Explicit local synthetic test only. No existing staff credentials are read,
// no privileged role is created, and no real account is modified.
const fs=require('fs'),path=require('path'),http=require('http'),assert=require('assert/strict');
const {randomUUID,randomBytes,createHash}=require('crypto'),{spawnSync}=require('child_process');
const API=path.resolve(__dirname,'../apps/api'),{Client}=require(path.join(API,'node_modules/pg'));
const ROOT=path.join(process.env.LOCALAPPDATA||'','VIEWS-Staging'),PRIVATE=path.join(ROOT,'private');
async function run(){
 if(process.platform!=='win32'||process.argv[2]!=='--ack=LOCAL_SYNTHETIC_AUTH_PROOF')throw Error('LOCAL_PROOF_ACK_REQUIRED');
 const configuration=JSON.parse(fs.readFileSync(path.join(PRIVATE,'runtime.json'),'utf8'));
 const workspace=JSON.parse(fs.readFileSync(path.join(PRIVATE,'workspace.json'),'utf8'));
 if(configuration.scope!=='views-windows-local-rehearsal'||workspace.organizationId!=='74240000-0000-4000-8000-000000000001')throw Error('LOCAL_FIXTURE_SCOPE_REQUIRED');
 const db=new Client({host:'127.0.0.1',port:55432,database:'views_local',user:'views_owner',password:configuration.ownerPassword,connectionTimeoutMillis:5000});
 await db.connect();const checks=[];let calls=0;
 const report={schemaVersion:1,stage:'7.25',result:'fail',checks,sourceCommit:spawnSync('git',['rev-parse','HEAD'],{encoding:'utf8',windowsHide:true}).stdout.trim(),
 trackedSourceDirty:spawnSync('git',['diff','--quiet','HEAD'],{windowsHide:true}).status!==0,scope:'new-local-synthetic-front-desk-only',productionEnabled:false,emailSent:false};
 const user=randomUUID(),member=randomUUID(),email='auth-proof-'+randomBytes(8).toString('hex')+'@views.invalid';
 const password='Local test phrase '+randomBytes(20).toString('hex');
 const invitation=randomBytes(32).toString('hex');let reservationId;
 async function call(route,body,session={}){
  return new Promise((resolve,reject)=>{
   const headers={'X-Views-Local-Workspace':'1'};
   if(body!==undefined){headers.Origin='http://127.0.0.1:4173';headers['Content-Type']='application/json';}
   if(session.cookie)headers.Cookie=session.cookie;if(session.csrf)headers['X-CSRF-Token']=session.csrf;if(session.key)headers['Idempotency-Key']=session.key;
   const req=http.request({host:'127.0.0.1',port:4173,path:'/local-api/'+route,method:body===undefined?'GET':'POST',headers},res=>{
    let text='';res.on('data',c=>{text+=c;});res.on('end',()=>{calls++;try{resolve({status:res.statusCode,body:JSON.parse(text),cookie:res.headers['set-cookie']?.[0]});}catch{reject(Error('INVALID_RESPONSE'));}});
   });req.setTimeout(15000,()=>req.destroy(Error('PROOF_TIMEOUT')));req.on('error',reject);if(body!==undefined)req.write(JSON.stringify(body));req.end();
  });
 }
 const ok=(r,status=200)=>assert.equal(r.status,status,'unexpected HTTP status');
 try{
  const scope=(await db.query('SELECT legal_name FROM organizations WHERE id=$1',[workspace.organizationId])).rows[0];
  assert.equal(scope?.legal_name,'VIEWS LOCAL WORKSPACE FIXTURE');
  // Only a NEW unprivileged fixture identity is seeded, through normal invitation issuance.
  await db.query('BEGIN');
  await db.query("INSERT INTO users(id,email,display_name,status) VALUES($1,$2,'Тест входа сотрудника','active')",[user,email]);
  await db.query("INSERT INTO organization_memberships(id,organization_id,user_id,role_id,status) SELECT $1,$2,$3,id,'invited' FROM roles WHERE code='front_desk'",[member,workspace.organizationId,user]);
  await db.query('INSERT INTO membership_property_scopes(membership_id,property_id) VALUES($1,$2)',[member,workspace.propertyId]);
  await db.query("SELECT staff_private.issue_token($1,'invite',$2,'local_fixture')",[member,createHash('sha256').update(invitation).digest('hex')]);
  await db.query('COMMIT');
  const anonymous=await call('session');ok(anonymous);assert.equal(anonymous.body.authenticated,false);assert.equal(anonymous.cookie,undefined);ok(await call('workspace'),401);checks.push('no_automatic_fixture_session');
  ok(await call('activate',{token:invitation,password:'short'}),400);
  ok(await call('activate',{token:invitation,password}));
  ok(await call('activate',{token:invitation,password}),400);checks.push('invitation_one_time_and_password_policy');
  ok(await call('login',{email,password:'Incorrect local test phrase'}),401);
  const logged=await call('login',{email,password});ok(logged);assert.equal(logged.body.authenticated,true);assert.equal(logged.body.token,undefined);
  assert.ok(logged.cookie.includes('HttpOnly')&&logged.cookie.includes('SameSite=Strict'));
  const session={cookie:logged.cookie.split(';')[0],csrf:logged.body.csrf};checks.push('password_login_HttpOnly_session');
  ok(await call('workspace',undefined,{cookie:session.cookie}),403);checks.push('csrf_required');
  const view=await call('workspace',undefined,session);ok(view);assert.equal(view.body.property.id,workspace.propertyId);checks.push('server_resolved_staff_scope');
  const unit=view.body.units[0],day=n=>new Date(Date.now()+(240+n)*86400000).toISOString().slice(0,10);
  const q=await call('quotes',{unitId:unit.unitId,ratePlanId:unit.ratePlanId,checkIn:day(0),checkOut:day(2),guests:1},session);ok(q);assert.equal(q.body.totalMinor,'130000000');
  const key=randomUUID();const holds=await Promise.all([call('holds',{quoteId:q.body.quoteId},{...session,key}),call('holds',{quoteId:q.body.quoteId},{...session,key})]);
  holds.forEach(r=>ok(r));assert.equal(holds[0].body.reservationId,holds[1].body.reservationId);reservationId=holds[0].body.reservationId;
  const reload=await call('workspace',undefined,session);ok(reload);assert.ok(reload.body.reservations.some(r=>r.reservationId===reservationId));
  ok(await call('release',{reservationId},{...session,key:randomUUID()}));checks.push('authenticated_quote_hold_reload_release');
  const counts=(await db.query('SELECT count(*)::int n FROM payment_intents WHERE reservation_id=$1',[reservationId])).rows[0];assert.equal(counts.n,0);
  ok(await call('logout',{all:false},session));
  assert.equal((await call('session',undefined,session)).body.authenticated,false);ok(await call('workspace',undefined,session),401);checks.push('logout_revokes_saved_session');
  const changedLogin=await call('login',{email,password});ok(changedLogin);const nextSession={cookie:changedLogin.cookie.split(';')[0],csrf:changedLogin.body.csrf};
  const nextPassword='New local test phrase '+randomBytes(20).toString('hex');
  ok(await call('password',{currentPassword:password,password:nextPassword},nextSession));
  assert.equal((await call('session',undefined,nextSession)).body.authenticated,false);checks.push('password_change_revokes_session');
  const replacement=await call('login',{email,password:nextPassword});ok(replacement);
  const last={cookie:replacement.cookie.split(';')[0],csrf:replacement.body.csrf};
  ok(await call('logout',{all:true},last));assert.equal((await call('session',undefined,last)).body.authenticated,false);checks.push('logout_all');
  // All changes below target only the newly created auth-proof membership.
  const again=await call('login',{email,password:nextPassword});ok(again);
  const revoked={cookie:again.cookie.split(';')[0],csrf:again.body.csrf};
  await db.query("UPDATE organization_memberships SET status='suspended' WHERE id=$1 AND user_id=$2",[member,user]);
  assert.equal((await call('session',undefined,revoked)).body.authenticated,false);
  await db.query("UPDATE organization_memberships SET status='active' WHERE id=$1 AND user_id=$2",[member,user]);
  assert.equal((await call('session',undefined,revoked)).body.authenticated,false);checks.push('suspension_revokes_session_without_resurrection');
  const scopedLogin=await call('login',{email,password:nextPassword});ok(scopedLogin);
  const scoped={cookie:scopedLogin.cookie.split(';')[0],csrf:scopedLogin.body.csrf};
  await db.query('DELETE FROM membership_property_scopes WHERE membership_id=$1 AND property_id=$2',[member,workspace.propertyId]);
  ok(await call('workspace',undefined,scoped),403);
  await db.query('INSERT INTO membership_property_scopes(membership_id,property_id) VALUES($1,$2)',[member,workspace.propertyId]);
  ok(await call('workspace',undefined,scoped));checks.push('removed_property_scope_denied_on_next_request');
  await db.query("UPDATE staff_private.sessions SET idle_expires_at=now()-interval '1 second' WHERE membership_id=$1 AND revoked_at IS NULL",[member]);
  assert.equal((await call('session',undefined,scoped)).body.authenticated,false);checks.push('idle_session_expiry');
  const resetCode=randomBytes(32).toString('hex'),finalPassword='Reset local test phrase '+randomBytes(20).toString('hex');
  await db.query("SELECT staff_private.issue_token($1,'reset',$2,'local_fixture')",[member,createHash('sha256').update(resetCode).digest('hex')]);
  ok(await call('reset',{token:resetCode,password:finalPassword}));
  ok(await call('reset',{token:resetCode,password:finalPassword}),400);checks.push('operator_issued_password_reset_is_single_use');
  // Separate local browser fixture: test identity only; never production secrets.
  fs.writeFileSync(path.join(PRIVATE,'staff-browser-fixture.json'),JSON.stringify({email,password:finalPassword,member,user}),{mode:0o600});
  Object.assign(report,{result:'pass',httpCalls:calls,checkCount:checks.length,checkedAt:new Date().toISOString(),reservationId,
    financialPaymentsCreated:0,existingStaffAccountsModified:false,credentialsOrTokensPrinted:false});
 }catch(e){await db.query('ROLLBACK').catch(()=>{});report.error={code:e.code||'TEST_ASSERTION',message:String(e.message).slice(0,160)};process.exitCode=1;}
 finally{await db.end();}
 fs.writeFileSync(path.join(ROOT,'evidence','stage725-auth-integration.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}
run().catch(()=>{console.error('STAFF_LOCAL_PROOF_FAILED');process.exitCode=1;});
