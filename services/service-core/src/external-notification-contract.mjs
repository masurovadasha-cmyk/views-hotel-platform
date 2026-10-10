/**
 * Explicit opt-in external delivery boundary. No transport credentials, no
 * provider SDK or real send operation is included in this module.
 */
const channels=new Set(["sms","email","push"]);
export function validateExternalNotification(command){
 if(!command||typeof command!=="object"||!channels.has(command.channel))throw Error("Invalid channel");
 if(typeof command.consentId!=="string"||!command.consentId.trim())throw Error("Consent required");
 if(typeof command.recipientRef!=="string"||!/^[a-zA-Z0-9:_-]{1,128}$/.test(command.recipientRef))throw Error("Invalid recipient reference");
 if(typeof command.templateId!=="string"||!/^[a-z0-9._-]{1,64}$/.test(command.templateId))throw Error("Invalid template");
 if(typeof command.idempotencyKey!=="string"||command.idempotencyKey.length<8||command.idempotencyKey.length>128)throw Error("Invalid idempotency key");
 if("phone" in command||"email" in command||"deviceToken" in command||"message" in command)throw Error("Raw recipient or message not allowed");
 return Object.freeze({channel:command.channel,consentId:command.consentId,recipientRef:command.recipientRef,templateId:command.templateId,idempotencyKey:command.idempotencyKey});
}
export function createSandboxNotificationTransport(){
 const sent=new Map();
 return {async send(command){
  const validated=validateExternalNotification(command);
  const prior=sent.get(validated.idempotencyKey);
  if(prior){
   if(JSON.stringify(prior.command)!==JSON.stringify(validated))throw Error("Idempotency conflict");
   return {...prior.result,replayed:true};
  }
  const result={status:"sandbox_accepted",providerReference:"sandbox:"+validated.idempotencyKey,replayed:false};
  sent.set(validated.idempotencyKey,{command:validated,result});
  return result;
 }};
}
