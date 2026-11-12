'use strict';
// Local fixture convention, not an officially reserved telephone range.
module.exports=async function(db,env,write){
 const enabled=()=>{if(env.NODE_ENV!=='test'||env.VIEWS_LOCAL_REHEARSAL!=='true'||env.VIEWS_DEMO_SMS!=='true')throw Error('DEMO_SMS_DISABLED');};
 enabled();
 const result=await db.query("SELECT shobj_description(oid,'pg_database') marker FROM pg_database WHERE datname=current_database()");
 if(result.rows[0]?.marker!=='VIEWS_DISPOSABLE_CORE_TEST')throw Error('DEMO_SMS_DISPOSABLE_DATABASE_REQUIRED');
 const validateRecipient=phone=>{enabled();if(!/^\+9980000000\d{2}$/.test(phone))throw Error('DEMO_SMS_SYNTHETIC_RECIPIENT_REQUIRED');};
 return {validateRecipient,async send(message){
  validateRecipient(message.phone);
  write({demoSms:true,challengeId:message.idempotencyKey,maskedPhone:'+998*******'+message.phone.slice(-2),code:message.code});
 }};
};
