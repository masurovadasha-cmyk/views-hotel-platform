'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{randomUUID,randomBytes}=require('node:crypto');
const {deriveToken,tokenHash,validateMailConfig,renderMessage,smtpTransport,classifyFailure}=require('../apps/api/ops/staff-mail.cjs');
const env={NODE_ENV:'test',VIEWS_LOCAL_REHEARSAL:'true'};
const keys={test:randomBytes(32).toString('hex')};
const config={version:1,transport:'capture',keyId:'test',keys,origin:'http://127.0.0.1:4173',from:'test@views.invalid',allowedRecipients:['staff@views.invalid'],smtpHost:'127.0.0.1',smtpPort:2525};
const job={id:randomUUID(),organization_id:randomUUID(),membership_id:randomUUID(),purpose:'invite',recipient_email:'staff@views.invalid',token_nonce:randomBytes(32).toString('hex'),key_id:'test',transport:'capture'};
test('deterministic token per immutable job and safe digest',()=>{const a=deriveToken(job,keys);assert.match(a,/^[a-f0-9]{64}$/);assert.equal(deriveToken(job,keys),a);assert.notEqual(tokenHash(a),a);});
for(const key of ['id','organization_id','membership_id','purpose','recipient_email','token_nonce','transport'])test('token binds '+key,()=>{
 const values={id:randomUUID(),organization_id:randomUUID(),membership_id:randomUUID(),purpose:'reset',recipient_email:'other@views.invalid',token_nonce:randomBytes(32).toString('hex'),transport:'smtp'};
 assert.notEqual(deriveToken({...job,[key]:values[key]},keys),deriveToken(job,keys));
});
test('missing/rotated key fails closed',()=>{assert.throws(()=>deriveToken(job,{}),/MAIL_KEY_UNAVAILABLE/);assert.notEqual(deriveToken(job,{test:randomBytes(32).toString('hex')}),deriveToken(job,keys));});
test('capture must stay on loopback with synthetic recipients',()=>{
 assert.equal(validateMailConfig(config,env).transport,'capture');
 for(const change of [{smtpHost:'example.com'},{origin:'https://example.com'},{allowedRecipients:['real@example.com']},{from:'sender@example.com'}])assert.throws(()=>validateMailConfig({...config,...change},env));
 assert.throws(()=>validateMailConfig(config,{NODE_ENV:'production'}));
});
test('external transport requires every approval and a fixed HTTPS origin',()=>{
 const c={...config,transport:'smtp',origin:'https://staff.example.com',smtpHost:'smtp.example.com',smtpPort:587,smtpUserRef:'SMTP_USER',smtpPassRef:'SMTP_PASS'};
 const e={VIEWS_ENV:'staging',VIEWS_STAFF_MAIL_SEND_ACK:'APPROVED_STAGING_RECIPIENTS',VIEWS_STAFF_MAIL_COST_ACK:'NO_NEW_SPEND',VIEWS_STAFF_MAIL_SENDER_APPROVED:'true',SMTP_USER:'fixture',SMTP_PASS:'fixture-only'};
 assert.equal(validateMailConfig(c,e).transport,'smtp');
 for(const key of Object.keys(e))assert.throws(()=>validateMailConfig(c,{...e,[key]:''}));
 assert.throws(()=>validateMailConfig({...c,origin:'http://staff.example.com'},e));
 assert.throws(()=>validateMailConfig({...c,origin:'https://staff.example.com/path'},e));
});
test('SMTP TLS and logging options cannot be caller-overridden',()=>{
 const c={...config,transport:'smtp',origin:'https://staff.example.com',smtpHost:'smtp.example.com',smtpPort:587,smtpUserRef:'SMTP_USER',smtpPassRef:'SMTP_PASS',tls:{rejectUnauthorized:false},debug:true};
 const e={VIEWS_ENV:'staging',VIEWS_STAFF_MAIL_SEND_ACK:'APPROVED_STAGING_RECIPIENTS',VIEWS_STAFF_MAIL_COST_ACK:'NO_NEW_SPEND',VIEWS_STAFF_MAIL_SENDER_APPROVED:'true',SMTP_USER:'fixture',SMTP_PASS:'fixture-only'};
 let options;smtpTransport(c,e,o=>{options=o;return {};});
 assert.equal(options.requireTLS,true);assert.equal(options.ignoreTLS,false);assert.equal(options.tls.rejectUnauthorized,true);assert.equal(options.debug,false);assert.equal(options.logger,false);
});
test('message uses token fragment with explicit submission, one recipient and stable Message-ID',()=>{
 const token=deriveToken(job,keys),m=renderMessage(job,token,config),url=m.text.match(/http[^\s]+/)[0];
 assert.ok(url.includes('#staff-action=activate&token='));assert.ok(!new URL(url).search.includes(token));
 assert.equal(m.to.length,1);assert.equal(m.messageId,renderMessage(job,token,config).messageId);assert.ok(m.text.includes('ТЕСТОВОЕ ПИСЬМО'));
 assert.equal(m.disableFileAccess,true);assert.equal(m.disableUrlAccess,true);
});
test('recipient and header injection fail before network',()=>{
 assert.throws(()=>deriveToken({...job,recipient_email:'staff@views.invalid\r\nBcc: other@example.com'},keys));
 assert.throws(()=>renderMessage({...job,recipient_email:'other@views.invalid'},deriveToken(job,keys),config));
});
test('only known non-delivery is retried; ambiguous timeout is not',()=>{
 assert.equal(classifyFailure({code:'ECONNREFUSED'}).outcome,'retry');assert.equal(classifyFailure({responseCode:451}).outcome,'retry');
 assert.equal(classifyFailure({responseCode:550}).outcome,'failed');assert.equal(classifyFailure({code:'ETIMEDOUT',message:'Bearer secret'}).outcome,'uncertain');
 assert.ok(!JSON.stringify(classifyFailure({message:'secret token'})).includes('secret'));
});
