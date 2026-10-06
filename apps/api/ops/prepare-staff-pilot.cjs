'use strict';
// Local operator tooling only. Does not create an administrator or send email.
const fs=require('fs'),path=require('path'),{randomBytes,createHash}=require('crypto'),{Client}=require('pg');
(async()=>{
 if(process.platform!=='win32'||process.argv[2]!=='--ack=LOCAL_STAFF_PILOT'||process.argv.slice(3).some(x=>x!=='--reset'))throw Error('LOCAL_STAFF_ACK_REQUIRED');
 const dir=path.join(process.env.LOCALAPPDATA,'VIEWS-Staging','private');
 const secret=JSON.parse(fs.readFileSync(path.join(dir,'runtime.json'),'utf8'));
 const fixture=JSON.parse(fs.readFileSync(path.join(dir,'workspace.json'),'utf8'));
 if(secret.scope!=='views-windows-local-rehearsal'||fixture.scope!=='views-local-core-workspace'||fixture.organizationId!=='74240000-0000-4000-8000-000000000001')throw Error('LOCAL_SCOPE_REQUIRED');
 const c=new Client({host:'127.0.0.1',port:55432,database:'views_local',user:'views_owner',password:secret.ownerPassword,connectionTimeoutMillis:5000});await c.connect();
 const reset=process.argv.includes('--reset'),purpose=reset?'reset':'invite',file=path.join(dir,reset?'staff-reset.txt':'staff-invitation.txt');
 try{
  await c.query('BEGIN');
  const m=(await c.query(`SELECT m.id,m.status,u.email,r.code,o.legal_name FROM organization_memberships m JOIN users u ON u.id=m.user_id
   JOIN roles r ON r.id=m.role_id JOIN organizations o ON o.id=m.organization_id WHERE m.id=$1 AND m.organization_id=$2 FOR UPDATE OF m`,[fixture.membershipId,fixture.organizationId])).rows[0];
  if(!m||m.code!=='front_desk'||m.email!=='local-workspace@views.invalid'||m.legal_name!=='VIEWS LOCAL WORKSPACE FIXTURE')throw Error('STAFF_FIXTURE_MISMATCH');
  const existing=(await c.query('SELECT 1 FROM staff_private.credentials WHERE membership_id=$1',[m.id])).rowCount;
  if(existing&&!reset){await c.query('ROLLBACK');console.log(JSON.stringify({alreadyEnrolled:true,credentialsPrinted:false}));return;}
  if(!existing&&reset)throw Error('STAFF_ACCOUNT_NOT_ENROLLED');
  if(!reset&&fs.existsSync(file)){
   const unused=(await c.query("SELECT 1 FROM staff_private.activation_tokens WHERE membership_id=$1 AND purpose='invite' AND used_at IS NULL AND expires_at>now()",[m.id])).rowCount;
   if(unused){await c.query('ROLLBACK');console.log(JSON.stringify({invitationReady:true,privateFile:file,emailSent:false}));return;}
  }
  if(!reset)await c.query("UPDATE organization_memberships SET status='invited' WHERE id=$1",[m.id]);
  const token=randomBytes(32).toString('hex'),digest=createHash('sha256').update(token).digest('hex');
  await c.query('SELECT staff_private.issue_token($1,$2,$3,$4)',[m.id,purpose,digest,'local_fixture']);
  await c.query('COMMIT');
  fs.writeFileSync(file,'VIEWS — локальная учётная запись ресепшена\n\nВеб: http://127.0.0.1:4173/?api=local-core\nEmail: '+m.email+'\n\n'+
   (reset?'Выберите «Есть код восстановления».':'Выберите «У меня есть приглашение».')+'\nОдноразовый код (24 часа):\n'+token+'\n\nСоздайте свой уникальный пароль длиной 15–128 символов, затем войдите.\n'+
   'Это локальный тестовый фонд, не production. Письмо не отправлялось; email не считается подтверждённым.\nКод не пересылайте в чат, GitHub или другим пользователям.\n',{mode:0o600});
  console.log(JSON.stringify({invitationReady:true,purpose,privateFile:file,emailSent:false,productionEnabled:false}));
 }catch(e){await c.query('ROLLBACK').catch(()=>{});throw e;}finally{await c.end();}
})().catch(e=>{console.error(JSON.stringify({ok:false,code:e.code||'STAFF_LOCAL_PREPARATION_FAILED'}));process.exitCode=1;});
