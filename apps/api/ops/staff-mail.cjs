'use strict';
// Dedicated mail worker, NOT imported into transactional Core and never a
// generic forwarding endpoint. The runtime DB role cannot issue invitations.
const {createHash,createHmac,randomBytes,randomUUID,timingSafeEqual}=require('node:crypto');
const HEX=/^[a-f0-9]{64}$/,ID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const EMAIL=/^[A-Za-z0-9.!#$%&*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,63}$/;
class MailError extends Error{constructor(code){super(code);this.code=code;}}
function requireValue(condition,code){if(!condition)throw new MailError(code);}
const tokenHash=value=>createHash('sha256').update(value).digest('hex');
function binding(job){
 requireValue(ID.test(job.id||'')&&ID.test(job.organization_id||'')&&ID.test(job.membership_id||'')&&
   ['invite','reset'].includes(job.purpose)&&EMAIL.test(job.recipient_email||'')&&job.recipient_email.length<=254&&
   HEX.test(job.token_nonce||'')&&/^[a-z0-9_-]{1,32}$/.test(job.key_id||'')&&['capture','smtp'].includes(job.transport),'MAIL_JOB_INVALID');
 return JSON.stringify(['views-staff-mail-v1',job.id,job.organization_id,job.membership_id,job.purpose,
   job.recipient_email,job.token_nonce,job.key_id,job.transport]);
}
function deriveToken(job,keys){
 const raw=keys?.[job.key_id];requireValue(typeof raw==='string'&&HEX.test(raw),'MAIL_KEY_UNAVAILABLE');
 return createHmac('sha256',Buffer.from(raw,'hex')).update(binding(job)).digest('hex');
}
function validateMailConfig(input,env=process.env){
 requireValue(input&&input.version===1&&['capture','smtp'].includes(input.transport),'MAIL_DISABLED');
 requireValue(/^[a-z0-9_-]{1,32}$/.test(input.keyId||'')&&HEX.test(input.keys?.[input.keyId]||''),'MAIL_KEY_INVALID');
 requireValue(Object.keys(input.keys).length<=3,'MAIL_KEY_RING_INVALID');
 requireValue(EMAIL.test(input.from||'')&&input.from.length<=254,'MAIL_SENDER_INVALID');
 requireValue(Array.isArray(input.allowedRecipients)&&input.allowedRecipients.length>0&&input.allowedRecipients.length<=20&&
   input.allowedRecipients.every(x=>typeof x==='string'&&EMAIL.test(x)&&x===x.toLowerCase()&&x.length<=254),'MAIL_RECIPIENT_ALLOWLIST_REQUIRED');
 let origin;try{origin=new URL(input.origin);}catch{throw new MailError('MAIL_ORIGIN_INVALID');}
 requireValue(origin.origin===input.origin&&!origin.username&&!origin.password,'MAIL_ORIGIN_INVALID');
 requireValue(Number.isInteger(input.smtpPort)&&input.smtpPort>=1&&input.smtpPort<=65535,'MAIL_SMTP_PORT_INVALID');
 if(input.transport==='capture'){
   requireValue(env.NODE_ENV==='test'&&env.VIEWS_LOCAL_REHEARSAL==='true'&&input.origin==='http://127.0.0.1:4173'&&
    input.smtpHost==='127.0.0.1'&&input.from.endsWith('@views.invalid')&&input.allowedRecipients.every(x=>x.endsWith('@views.invalid')),'MAIL_CAPTURE_LOCAL_ONLY');
 }else{
   requireValue(env.VIEWS_ENV==='staging'&&env.VIEWS_STAFF_MAIL_SEND_ACK==='APPROVED_STAGING_RECIPIENTS'&&
    env.VIEWS_STAFF_MAIL_COST_ACK==='NO_NEW_SPEND'&&env.VIEWS_STAFF_MAIL_SENDER_APPROVED==='true','MAIL_EXTERNAL_NOT_APPROVED');
   requireValue(origin.protocol==='https:'&&!/^(?:localhost|127\.|\[)/.test(origin.hostname),'MAIL_HTTPS_REQUIRED');
   requireValue(typeof input.smtpHost==='string'&&/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])$/.test(input.smtpHost)&&
     input.smtpHost.includes('.')&&[465,587].includes(input.smtpPort),'MAIL_SMTP_HOST_INVALID');
   requireValue(/^[A-Z][A-Z0-9_]{2,127}$/.test(input.smtpUserRef||'')&&/^[A-Z][A-Z0-9_]{2,127}$/.test(input.smtpPassRef||'')&&
     typeof env[input.smtpUserRef]==='string'&&env[input.smtpUserRef].length>0&&typeof env[input.smtpPassRef]==='string'&&env[input.smtpPassRef].length>=8,'MAIL_SMTP_CREDENTIAL_REQUIRED');
 }
 return Object.freeze({...input,keys:Object.freeze({...input.keys}),allowedRecipients:Object.freeze([...input.allowedRecipients])});
}
function renderMessage(job,token,config){
 requireValue(HEX.test(token),'MAIL_TOKEN_INVALID');
 requireValue(job.transport===config.transport&&config.allowedRecipients.includes(job.recipient_email),'MAIL_RECIPIENT_NOT_APPROVED');
 const action=job.purpose==='invite'?'activate':'reset';
 // Fragment is not sent in HTTP/Referer; the UI removes it before rendering.
 const url=config.origin+'/?api=local-core#staff-action='+action+'&token='+token;
 const title=job.purpose==='invite'?'Приглашение сотрудника VIEWS':'Восстановление доступа VIEWS';
 const local=job.transport==='capture';
 const text=(local?'ТЕСТОВОЕ ПИСЬМО — не отправлено во внешний почтовый ящик.\n\n':'')+title+'\n\n'+
  'Для '+job.recipient_email+'.\nОткройте ссылку и задайте собственный пароль:\n'+url+'\n\n'+
  (job.purpose==='invite'?'Ссылка действует до 24 часов.':'Ссылка действует до 30 минут.')+' Она одноразовая. Само открытие ссылки не активирует учётную запись.\n'+
  'Не пересылайте письмо или код другим людям. VIEWS не просит присылать пароль в ответ.\n'+
  'Если вы не ожидали это письмо, не используйте ссылку и обратитесь к администратору, который вас приглашал.\n';
 const fromDomain=config.from.split('@')[1];
 return {from:{name:'VIEWS — доступ сотрудников',address:config.from},to:[{address:job.recipient_email}],
  subject:(local?'[LOCAL TEST] ':'')+title,text,disableFileAccess:true,disableUrlAccess:true,
  messageId:'<staff-'+job.id+'@'+fromDomain+'>',headers:{'X-Views-Message-Type':'staff-'+job.purpose}};
}
function smtpTransport(config,env=process.env,create){
 const c=validateMailConfig(config,env);
 const factory=create||require('nodemailer').createTransport;
 const options={host:c.smtpHost,port:c.smtpPort,secure:c.transport==='smtp'&&c.smtpPort===465,
   requireTLS:c.transport==='smtp',ignoreTLS:c.transport==='capture',opportunisticTLS:false,
   logger:false,debug:false,transactionLog:false,pool:false,disableFileAccess:true,disableUrlAccess:true,
   connectionTimeout:5000,greetingTimeout:5000,socketTimeout:12000,dnsTimeout:5000,
   tls:{minVersion:'TLSv1.2',rejectUnauthorized:true,servername:c.smtpHost}};
 if(c.transport==='smtp')options.auth={user:env[c.smtpUserRef],pass:env[c.smtpPassRef]};
 const client=factory(options);
 return {async send(job,token){
   const result=await client.sendMail(renderMessage(job,token,c));
   if(result.accepted?.length===1&&String(result.accepted[0]).toLowerCase()===job.recipient_email&&!result.rejected?.length)
     return {outcome:'accepted',code:c.transport==='capture'?'CAPTURE_ACCEPTED':'SMTP_ACCEPTED'};
   return {outcome:'uncertain',code:'SMTP_RESULT_UNKNOWN'};
 },close(){client.close?.();}};
}
// Only a positive protocol rejection or pre-connect failure is retryable.
// No stdout, SMTP response, recipient, token, URL, or raw error is reported.
function classifyFailure(e){
 if(e?.code==='ECONNECTION'&&['ECONNREFUSED','ENETUNREACH','EHOSTUNREACH','ENOTFOUND'].includes(e?.errno||e?.cause?.code))
   return {outcome:'retry',code:'MAIL_CONNECT_FAILED'};
 if(['ECONNREFUSED','ENETUNREACH','EHOSTUNREACH','ENOTFOUND'].includes(e?.code))return {outcome:'retry',code:'MAIL_CONNECT_FAILED'};
 if(Number.isInteger(e?.responseCode)&&e.responseCode>=400&&e.responseCode<500)return {outcome:'retry',code:'SMTP_TEMPORARY_REJECTION'};
 if(Number.isInteger(e?.responseCode)&&e.responseCode>=500)return {outcome:'failed',code:'SMTP_PERMANENT_REJECTION'};
 if(['EAUTH','ETLS','ECONFIG'].includes(e?.code))return {outcome:'failed',code:'SMTP_CONFIGURATION_REJECTED'};
 return {outcome:'uncertain',code:'SMTP_DELIVERY_UNKNOWN'};
}
async function enqueueMail(operatorDb,{organizationId,membershipId,requestId,purpose,recipient},config){
 requireValue(ID.test(organizationId||'')&&ID.test(membershipId||'')&&ID.test(requestId||'')&&['invite','reset'].includes(purpose),'MAIL_REQUEST_INVALID');
 requireValue(config.allowedRecipients.includes(recipient),'MAIL_RECIPIENT_NOT_APPROVED');
 const job={id:randomUUID(),organization_id:organizationId,membership_id:membershipId,purpose,recipient_email:recipient,
 token_nonce:randomBytes(32).toString('hex'),key_id:config.keyId,transport:config.transport};
 const token=deriveToken(job,config.keys);
 const row=(await operatorDb.query('SELECT staff_private.enqueue_mail($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) AS id',
   [organizationId,membershipId,requestId,job.id,purpose,recipient,tokenHash(token),job.token_nonce,job.key_id,job.transport])).rows[0];
 requireValue(ID.test(row?.id||''),'MAIL_ENQUEUE_FAILED');
 return {jobId:row.id}; // Never return raw token or caller-usable activation link.
}
async function deliverOne(workerDb,organizationId,config,transport){
 requireValue(ID.test(organizationId||''),'MAIL_TENANT_REQUIRED');
 const job=(await workerDb.query('SELECT * FROM staff_mail_ops.claim($1,$2)',[organizationId,config.transport])).rows[0];
 if(!job)return {state:'idle',dispatched:false};
 let result;
 try{
   const token=deriveToken(job,config.keys),got=Buffer.from(tokenHash(token),'hex'),expected=Buffer.from(job.token_hash,'hex');
   requireValue(expected.length===got.length&&timingSafeEqual(expected,got),'MAIL_TOKEN_BINDING_INVALID');
   // Render before opening the network, with a fail-closed recipient allowlist.
   renderMessage(job,token,config);
   const ready=(await workerDb.query('SELECT staff_mail_ops.ready($1,$2,$3) AS ready',[organizationId,job.id,job.lease_id])).rows[0]?.ready;
   if(!ready)result={outcome:'cancelled',code:'MAIL_CONTEXT_CHANGED'};
   else{try{result=await transport.send(job,token);}catch(e){result=classifyFailure(e);}}
 }catch(e){result={outcome:'failed',code:e instanceof MailError?e.code:'MAIL_PREPARATION_FAILED'};}
 requireValue(result&&['accepted','uncertain','retry','failed','cancelled'].includes(result.outcome)&&/^[A-Z][A-Z0-9_]{0,63}$/.test(result.code),'MAIL_TRANSPORT_RESULT_INVALID');
 const saved=(await workerDb.query('SELECT staff_mail_ops.finish($1,$2,$3,$4,$5) AS saved',
   [organizationId,job.id,job.lease_id,result.outcome,result.code])).rows[0]?.saved;
 return {jobId:job.id,state:saved?result.outcome:'uncertain',code:saved?result.code:'MAIL_RESULT_NOT_COMMITTED',
   receiptCommitted:saved===true,externalDeliveryAttempted:config.transport==='smtp'};
}
module.exports={MailError,binding,deriveToken,tokenHash,validateMailConfig,renderMessage,smtpTransport,classifyFailure,enqueueMail,deliverOne};
