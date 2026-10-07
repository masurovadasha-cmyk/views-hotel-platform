'use strict';
const assert=require('node:assert/strict'),{createHash}=require('node:crypto');
module.exports=async function recoveryProof({page,context,cdp,initialAuthenticator,owner,runtime,worker,staff,enqueue,send,rpc,ORG,password,check,api,assertion}){
 let device=initialAuthenticator.authenticatorId;
 const panel=page.getByRole('region',{name:'Ключ доступа',exact:true});
 async function newDevice(){await cdp.send('WebAuthn.removeVirtualAuthenticator',{authenticatorId:device});device=(await cdp.send('WebAuthn.addVirtualAuthenticator',{options:{protocol:'ctap2',transport:'usb',hasResidentKey:true,hasUserVerification:true,isUserVerified:true,automaticPresenceSimulation:true}})).authenticatorId;}
 async function login(f){await context.clearCookies();await page.goto('http://localhost:4173/?api=local-core');await page.getByLabel('Email сотрудника',{exact:true}).fill(f.email);await page.getByLabel('Пароль',{exact:true}).fill(password);await page.getByRole('button',{name:'Войти',exact:true}).click();await panel.waitFor();}
 async function fixture(){const f=await staff(),q=await enqueue(f);assert.equal((await send(f)).state,'accepted');assert.equal((await rpc('activate',{token:q.token,password})).status,200);await login(f);await panel.getByLabel('Текущий пароль для ключа').fill(password);await panel.getByRole('button',{name:'Зарегистрировать ключ',exact:true}).click();await panel.getByText('Личность подтверждена на 5 минут.',{exact:true}).waitFor();return f;}
 async function auth(){const q=await api('options',{purpose:'authenticate',password:null});assert.equal(q.status,200);const response=await assertion(q.body);assert.equal((await api('verify',{purpose:'authenticate',challengeId:q.body.challengeId,response})).status,200);}
 const key=f=>owner.query('SELECT id FROM staff_private.passkeys WHERE membership_id=$1',[f.member]).then(r=>r.rows[0].id);
 async function register(c){return page.evaluate(async o=>{const d=s=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));o.challenge=d(o.challenge);o.user.id=d(o.user.id);o.excludeCredentials=o.excludeCredentials?.map(x=>({...x,id:d(x.id)}));return (await navigator.credentials.create({publicKey:o})).toJSON();},c.options);}
 const digest=(f,code)=>createHash('sha256').update('staff-recovery:v1:'+f.org+':'+f.member+':'+code.replaceAll('-','')).digest('hex');
 const f=await fixture(),oldKey=await key(f);let codes;
 await check('recovery_codes_shown_once_and_only_digests_persist',async()=>{
  await panel.getByLabel('Пароль для резервных кодов').fill(password);await panel.getByRole('button',{name:'Выдать новые резервные коды',exact:true}).click();
  const display=panel.getByLabel('Новые резервные коды');await display.waitFor();codes=await display.locator('code').allTextContents();assert.equal(codes.length,8);assert.equal(new Set(codes).size,8);
  for(const width of [360,390,768,1440]){await page.setViewportSize({width,height:1000});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'RECOVERY_HORIZONTAL_OVERFLOW');}
  const rows=(await owner.query('SELECT * FROM staff_private.passkey_recovery_codes WHERE membership_id=$1',[f.member])).rows;assert.equal(rows.length,8);
  for(const code of codes){assert.ok(rows.some(r=>r.code_hash===digest(f,code)));assert.ok(!JSON.stringify(rows).includes(code));}
  assert.equal((await api('state',{})).body.recoveryCodesRemaining,8);assert.equal((await api('state',{})).body.verifiedUntil,null);
  assert.ok(!JSON.stringify(await page.evaluate(()=>({local:JSON.stringify(localStorage),session:JSON.stringify(sessionStorage)}))).includes(codes[0]));
  await display.getByRole('button',{name:'Я сохранил коды — скрыть'}).click();assert.equal(await display.count(),0);
  await page.reload();await panel.waitFor();assert.equal(await panel.getByLabel('Новые резервные коды').count(),0);
 });
 await check('recovery_password_alone_or_invalid_code_cannot_replace_key',async()=>{
  assert.equal((await api('recovery-codes',{password})).status,400);
  assert.equal((await api('replace/options',{password,recoveryCode:null})).status,400);
  assert.equal((await api('replace/options',{password,recoveryCode:'0'.repeat(32)})).status,400);
  assert.equal(await key(f),oldKey);
 });
 await check('recovery_code_concurrent_use_one_winner_failed_enrollment_preserves_key',async()=>{
  const attempts=await Promise.all([api('replace/options',{password,recoveryCode:codes[0]}),api('replace/options',{password,recoveryCode:codes[0]})]);assert.deepEqual(attempts.map(r=>r.status).sort(),[200,400]);
  const q=attempts.find(r=>r.status===200).body;
  assert.equal((await api('verify',{purpose:'replace',challengeId:q.challengeId,response:{}})).status,400);
  assert.equal(await key(f),oldKey);assert.equal((await api('state',{})).body.recoveryCodesRemaining,7);
  assert.equal((await owner.query('SELECT used_at IS NOT NULL used FROM staff_private.passkey_recovery_codes WHERE code_hash=$1',[digest(f,codes[0])])).rows[0].used,true);
 });
 await check('recovery_browser_new_key_revokes_old_key_codes_and_all_sessions',async()=>{
  const sibling=(await rpc('login',{email:f.email,password})).body.token;
  await newDevice();await panel.getByLabel('Пароль для замены ключа').fill(password);await panel.getByLabel('Резервный код',{exact:true}).fill(codes[1]);
  await panel.getByRole('button',{name:'Заменить ключ и завершить все сессии',exact:true}).click();await page.getByRole('heading',{name:'Вход в рабочую область',exact:true}).waitFor();
  await page.getByText('Ключ заменён. Все сессии завершены. Войдите заново.',{exact:true}).waitFor();
  assert.notEqual(await key(f),oldKey);assert.equal((await rpc('session',undefined,sibling)).status,401);
  assert.equal((await owner.query('SELECT count(*)::int n FROM staff_private.passkey_recovery_codes WHERE membership_id=$1',[f.member])).rows[0].n,0);
  assert.equal((await owner.query('SELECT count(*)::int n FROM staff_private.sessions WHERE membership_id=$1 AND revoked_at IS NULL',[f.member])).rows[0].n,0);
  await login(f);assert.equal((await api('state',{})).body.verifiedUntil,null);await auth();
 });
 // Separate synthetic membership keeps the eight-password-reauth limit intact.
 const g=await fixture();let oldCodes,newCodes;
 await check('recovery_rotation_invalidates_old_codes_and_expiry_is_enforced',async()=>{
  oldCodes=(await api('recovery-codes',{password})).body.recoveryCodes;assert.equal(oldCodes.length,8);await auth();
  newCodes=(await api('recovery-codes',{password})).body.recoveryCodes;assert.equal(newCodes.length,8);
  assert.equal((await api('replace/options',{password,recoveryCode:oldCodes[0]})).status,400);
  await owner.query("UPDATE staff_private.passkey_recovery_codes SET expires_at=now()-interval '1 second' WHERE code_hash=$1",[digest(g,newCodes[0])]);
  assert.equal((await api('replace/options',{password,recoveryCode:newCodes[0]})).status,400);
  // A code from another membership is not usable, even in a currently valid session.
  const sibling=(await rpc('login',{email:f.email,password})).body.token;
  assert.equal((await runtime.query("SELECT app.staff_mfa($1,$2,'begin',$3) value",[ORG,createHash('sha256').update(sibling).digest('hex'),{purpose:'replace',challengeHash:'a'.repeat(64),recoveryHash:digest(g,newCodes[1])}])).rows[0].value,null);
 });
 await check('recovery_replacement_by_existing_key_revokes_backup_codes',async()=>{
  await auth();const priorKey=await key(g),q=await api('replace/options',{password,recoveryCode:null});assert.equal(q.status,200);
  assert.equal(q.body.options.excludeCredentials[0].id,priorKey);await newDevice();const response=await register(q.body);
  const r=await api('verify',{purpose:'replace',challengeId:q.body.challengeId,response});assert.equal(r.status,200);assert.equal(r.body.loginRequired,true);
  assert.notEqual(await key(g),priorKey);assert.equal((await owner.query('SELECT count(*)::int n FROM staff_private.passkey_recovery_codes WHERE membership_id=$1',[g.member])).rows[0].n,0);
 });
 const h=await fixture(),hKey=await key(h);
 const reserve=(await api('recovery-codes',{password})).body.recoveryCodes;assert.equal(reserve.length,8);
 const hSession=(await context.cookies('http://localhost:4173/local-api/session')).find(c=>c.name==='views_staff_session').value;
 const hHash=createHash('sha256').update(hSession).digest('hex');
 await check('recovery_database_failure_rolls_back_key_deletion_and_revocation',async()=>{
  const pending=(await api('replace/options',{password,recoveryCode:reserve[0]})).body;
  const input={purpose:'replace',challengeId:pending.challengeId};
  assert.ok((await runtime.query("SELECT app.staff_mfa($1,$2,'claim',$3) value",[ORG,hHash,input])).rows[0].value);
  // Exercise a transaction failure after DELETE, with an already owned unique ID.
  const collision=await key(g);
  await assert.rejects(runtime.query("SELECT app.staff_mfa($1,$2,'finish',$3)",[ORG,hHash,{...input,credentialId:collision,publicKey:Buffer.alloc(32,1).toString('base64'),counter:0}]),e=>e.code==='23505');
  assert.equal(await key(h),hKey);assert.equal((await api('state',{})).status,200);
  assert.equal((await owner.query('SELECT count(*)::int n FROM staff_private.passkey_recovery_codes WHERE membership_id=$1',[h.member])).rows[0].n,8);
 });
 await check('recovery_expired_completion_keeps_old_key_and_spent_code_spent',async()=>{
  const pending=(await api('replace/options',{password,recoveryCode:reserve[1]})).body,input={purpose:'replace',challengeId:pending.challengeId};
  assert.ok((await runtime.query("SELECT app.staff_mfa($1,$2,'claim',$3) value",[ORG,hHash,input])).rows[0].value);
  await owner.query("UPDATE staff_private.passkey_challenges SET expires_at=now()-interval '1 second' WHERE id=$1",[pending.challengeId]);
  assert.equal((await runtime.query("SELECT app.staff_mfa($1,$2,'finish',$3) value",[ORG,hHash,{...input,credentialId:'unused-id',publicKey:Buffer.alloc(32,1).toString('base64'),counter:0}])).rows[0].value,null);
  assert.equal(await key(h),hKey);assert.equal((await api('state',{})).body.recoveryCodesRemaining,6);
  assert.equal((await api('replace/options',{password,recoveryCode:reserve[1]})).status,400);
 });
 await check('recovery_private_schema_and_audit_do_not_expose_codes',async()=>{
  for(const pool of [runtime,worker])await assert.rejects(pool.query('SELECT * FROM staff_private.passkey_recovery_codes'),e=>e.code==='42501');
  const rows=(await owner.query("SELECT action,after_state FROM audit_log WHERE action LIKE 'staff.recovery_%' OR action LIKE 'staff.passkey_replace%'")).rows;assert.ok(rows.length>=6);
  const audit=JSON.stringify(rows);for(const code of [...codes,...oldCodes,...newCodes,...reserve]){assert.ok(!audit.includes(code));assert.ok(!audit.includes(code.replaceAll('-','')));}
 });
};
