'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require('playwright');
const {createReviewServer}=require('../apps/api/ops/serve-local-review.cjs');
module.exports=async function passkeyProof({owner,runtime,worker,staff,enqueue,send,rpc,internalKey,ORG,password,check}){
 const web=createReviewServer({configuration:{internalKey,fixture:{organizationId:ORG,propertyId:ORG,units:[]}}});
 await new Promise((r,j)=>{web.once('error',j);web.listen(4173,'127.0.0.1',r);});let browser;const diagnostics=[];
 try{
  browser=await chromium.launch({headless:true,executablePath:process.env.VIEWS_BROWSER_EXECUTABLE||(fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox']});
  const context=await browser.newContext(),page=await context.newPage();page.setDefaultTimeout(10000);
  page.on('request',r=>{if(r.url().includes('/passkey/'))diagnostics.push({request:new URL(r.url()).pathname,bytes:r.postData()?.length});});
  page.on('response',async r=>{if(r.url().includes('/passkey/')){const body=await r.json().catch(()=>({}));diagnostics.push({route:new URL(r.url()).pathname,status:r.status(),error:body.error});}});
  const cdp=await context.newCDPSession(page);await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator',{options:{protocol:'ctap2',transport:'usb',hasResidentKey:true,hasUserVerification:true,isUserVerified:true,automaticPresenceSimulation:true}});
  const f=await staff(),q=await enqueue(f);assert.equal((await send(f)).state,'accepted');assert.equal((await rpc('activate',{token:q.token,password})).status,200);
  await page.goto('http://localhost:4173/?api=local-core');await page.getByLabel('Email сотрудника',{exact:true}).fill(f.email);await page.getByLabel('Пароль',{exact:true}).fill(password);await page.getByRole('button',{name:'Войти',exact:true}).click();
  const panel=page.getByRole('region',{name:'Ключ доступа',exact:true});await panel.waitFor();
  const api=(route,body,csrf=true)=>page.evaluate(async({route,body,csrf})=>{
   const session=await (await fetch('/local-api/session',{headers:{'X-Views-Local-Workspace':'1'}})).json();
   const r=await fetch('/local-api/passkey/'+route,{method:'POST',headers:{'Content-Type':'application/json','X-Views-Local-Workspace':'1',...(csrf?{'X-CSRF-Token':session.csrf}:{})},body:JSON.stringify(body)});
   return {status:r.status,body:await r.json()};
  },{route,body,csrf});
  async function begin(){const r=await api('options',{purpose:'authenticate',password:null});assert.equal(r.status,200);return r.body;}
  async function assertion(ceremony){return page.evaluate(async options=>{
   const decode=s=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
   options.challenge=decode(options.challenge);options.allowCredentials=options.allowCredentials.map(c=>({...c,id:decode(c.id)}));
   return (await navigator.credentials.get({publicKey:options})).toJSON();
  },ceremony.options);}
  const verify=(c,response)=>api('verify',{purpose:'authenticate',challengeId:c.challengeId,response});
  await check('passkey_enrollment_requires_password_and_CSRF',async()=>{
   assert.equal((await api('options',{purpose:'register',password:'wrong password'})).status,401);
   assert.equal((await api('options',{purpose:'register',password},false)).status,403);
   assert.equal((await owner.query('SELECT count(*)::int n FROM staff_private.passkeys WHERE membership_id=$1',[f.member])).rows[0].n,0);
  });
  await check('passkey_browser_registers_UV_credential',async()=>{
   await panel.getByLabel('Текущий пароль для ключа').fill(password);await panel.getByRole('button',{name:'Зарегистрировать ключ',exact:true}).click();
   const outcome=await Promise.race([panel.getByText('Личность подтверждена на 5 минут.',{exact:true}).waitFor().then(()=>true),panel.getByRole('alert').waitFor().then(()=>false)]);assert.equal(outcome,true,'PASSKEY_ENROLLMENT_UI_FAILED');
   const k=(await owner.query('SELECT * FROM staff_private.passkeys WHERE membership_id=$1',[f.member])).rows[0];assert.ok(k.public_key.length>16);
   assert.equal((await api('options',{purpose:'register',password})).status,400);
   for(const width of [360,390,768,1440]){await page.setViewportSize({width,height:1000});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
  });
  await check('passkey_step_up_after_reload_uses_existing_key',async()=>{
   await page.reload();await panel.getByRole('button',{name:'Подтвердить ключом',exact:true}).waitFor();
   const response=page.waitForResponse(r=>r.url().endsWith('/passkey/verify'));
   await panel.getByRole('button',{name:'Подтвердить ключом',exact:true}).click();assert.equal((await response).status(),200);
  });
  await check('passkey_concurrent_replay_has_one_winner',async()=>{
   const c=await begin(),r=await assertion(c);const results=await Promise.all([verify(c,r),verify(c,r)]);assert.deepEqual(results.map(x=>x.status).sort(),[200,400]);
   assert.equal((await verify(c,r)).status,400);
  });
  await check('passkey_wrong_origin_signature_UV_and_challenge_rejected',async()=>{
   for(const mutation of ['origin','signature','uv','challenge','credentialId','userHandle']){
    const c=await begin(),r=await assertion(c);
    if(mutation==='origin'||mutation==='challenge'){
     const data=JSON.parse(Buffer.from(r.response.clientDataJSON,'base64url'));data[mutation]=mutation==='origin'?'https://attacker.invalid':'unbound';r.response.clientDataJSON=Buffer.from(JSON.stringify(data)).toString('base64url');
    }else if(mutation==='signature'){const bytes=Buffer.from(r.response.signature,'base64url');bytes[bytes.length-1]^=1;r.response.signature=bytes.toString('base64url');}
    else if(mutation==='credentialId'){r.id='invalid-credential';r.rawId=r.id;}
    else if(mutation==='userHandle'){r.response.userHandle=Buffer.from('another-membership').toString('base64url');}
    else{const bytes=Buffer.from(r.response.authenticatorData,'base64url');bytes[32]&=~4;r.response.authenticatorData=bytes.toString('base64url');}
    assert.equal((await verify(c,r)).status,400);
    // Failed cryptographic attempts consume the ceremony as well.
    assert.equal((await verify(c,r)).status,400);
   }
  });
  await check('passkey_expired_and_superseded_challenges_rejected',async()=>{
   const c=await begin(),r=await assertion(c);await owner.query("UPDATE staff_private.passkey_challenges SET expires_at=now()-interval '1 second' WHERE id=$1",[c.challengeId]);assert.equal((await verify(c,r)).status,400);
   const old=await begin(),oldResponse=await assertion(old);await begin();assert.equal((await verify(old,oldResponse)).status,400);
  });
  await check('passkey_challenge_rate_bound',async()=>{assert.equal((await api('options',{purpose:'authenticate',password:null})).status,400);});
  // A new session gives an independent bounded challenge budget, never reuses proof.
  const cookies=await context.cookies('http://localhost:4173/local-api/session');const session=cookies.find(c=>c.name==='views_staff_session').value;
  const {createHash}=require('node:crypto'),hash=createHash('sha256').update(session).digest('hex');
  await check('passkey_state_is_tenant_session_bound_and_private',async()=>{
   const other='74260000-0000-4000-8000-000000000002';
   assert.equal((await runtime.query("SELECT app.staff_mfa($1,$2,'state','{}') value",[other,hash])).rows[0].value,null);
   for(const pool of [runtime,worker])for(const table of ['passkeys','passkey_challenges'])await assert.rejects(pool.query('SELECT * FROM staff_private.'+table),e=>e.code==='42501');
   const login=await rpc('login',{email:f.email,password});assert.equal(login.status,200);
   const state=await rpc('passkey/state',{},login.body.token);assert.equal(state.status,200);assert.equal(state.body.registered,true);assert.equal(state.body.verifiedUntil,null);
   const pending=await rpc('passkey/options',{purpose:'authenticate',password:null},login.body.token);assert.equal(pending.status,200);
   const r=await assertion(pending.body);assert.equal((await verify(pending.body,r)).status,400);
   assert.equal((await rpc('passkey/verify',{purpose:'authenticate',challengeId:pending.body.challengeId,response:r},login.body.token)).status,200);
   await owner.query("UPDATE staff_private.sessions SET passkey_verified_until=now()-interval '1 second' WHERE token_hash=$1",[hash]);assert.equal((await api('state',{})).body.verifiedUntil,null);
  });
  await check('passkey_finish_rechecks_expiry_after_row_lock_wait',async()=>{
   const login=await rpc('login',{email:f.email,password}),token=login.body.token;
   const sessionHash=createHash('sha256').update(token).digest('hex');
   const pending=(await rpc('passkey/options',{purpose:'authenticate',password:null},token)).body;
   const input={purpose:'authenticate',challengeId:pending.challengeId};
   const claimed=(await runtime.query("SELECT app.staff_mfa($1,$2,'claim',$3) value",[ORG,sessionHash,input])).rows[0].value;
   assert.ok(claimed);const lock=await owner.connect();let result;
   try{
    await owner.query("UPDATE staff_private.passkey_challenges SET expires_at=clock_timestamp()+interval '1 second' WHERE id=$1",[pending.challengeId]);
    await lock.query('BEGIN');await lock.query('SELECT 1 FROM staff_private.passkey_challenges WHERE id=$1 FOR UPDATE',[pending.challengeId]);
    result=runtime.query("SELECT app.staff_mfa($1,$2,'finish',$3) value",[ORG,sessionHash,{...input,credentialId:claimed.credentialId,previousCounter:claimed.counter,counter:claimed.counter+1}]);
    let waiting=false;for(let i=0;i<30;i++){waiting=(await owner.query("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE usename='views_app' AND wait_event_type='Lock') waiting")).rows[0].waiting;if(waiting)break;await new Promise(r=>setTimeout(r,10));}
    assert.equal(waiting,true);await owner.query('SELECT pg_sleep(1.1)');await lock.query('COMMIT');assert.equal((await result).rows[0].value,null);
    assert.equal((await rpc('passkey/state',{},token)).body.verifiedUntil,null);
   }finally{await lock.query('ROLLBACK');lock.release();if(result)await result.catch(()=>{});}
  });
  await check('passkey_password_reset_and_offboarding_revoke_pending_proofs',async()=>{
   const login=await rpc('login',{email:f.email,password});const token=login.body.token;
   const pending=await rpc('passkey/options',{purpose:'authenticate',password:null},token);const r=await assertion(pending.body);
   const reset=await enqueue(f,'reset');assert.equal((await send(f)).state,'accepted');assert.equal((await rpc('reset',{token:reset.token,password:password+' changed'})).status,200);
   assert.equal((await rpc('passkey/verify',{purpose:'authenticate',challengeId:pending.body.challengeId,response:r},token)).status,401);
   const next=await rpc('login',{email:f.email,password:password+' changed'});assert.equal((await rpc('passkey/state',{},next.body.token)).body.verifiedUntil,null);
   await owner.query("UPDATE organization_memberships SET status='suspended' WHERE id=$1",[f.member]);await owner.query("UPDATE organization_memberships SET status='active' WHERE id=$1",[f.member]);
   assert.equal((await rpc('passkey/state',{},next.body.token)).status,401);
  });
 }catch(e){console.error('PASSKEY_DIAGNOSTICS',JSON.stringify(diagnostics));throw e;}finally{if(browser)await browser.close();web.closeAllConnections();await new Promise(r=>web.close(r));}
};
