import test from "node:test";
import assert from "node:assert/strict";
import {MAX_NOTIFICATION_RECOVERY_BATCH,validateNotificationRecoveryRequest} from "../src/notification-admin.mjs";

const org="11111111-1111-4111-8111-111111111111";
const job="22222222-2222-4222-8222-222222222222";
const base={organizationId:org,jobIds:[job],actorId:"admin-1",reason:"Retry after transport issue"};

test("notification recovery accepts bounded, auditable requests",()=>{
 assert.equal(validateNotificationRecoveryRequest(base),true);
 assert.equal(MAX_NOTIFICATION_RECOVERY_BATCH,25);
});
test("notification recovery rejects missing, duplicate, malformed, and oversized job IDs",()=>{
 assert.throws(()=>validateNotificationRecoveryRequest({...base,jobIds:[]}),{status:422});
 assert.throws(()=>validateNotificationRecoveryRequest({...base,jobIds:[job,job]}),{status:422});
 assert.throws(()=>validateNotificationRecoveryRequest({...base,jobIds:["invalid"]}),{status:422});
 assert.throws(()=>validateNotificationRecoveryRequest({...base,jobIds:Array.from({length:26},(_,i)=>"00000000-0000-4000-8000-"+String(i).padStart(12,"0"))}),{status:422});
});
test("notification recovery requires an attributable reason and actor",()=>{
 assert.throws(()=>validateNotificationRecoveryRequest({...base,reason:"retry"}),{status:422});
 assert.throws(()=>validateNotificationRecoveryRequest({...base,reason:"Valid reason\u0000with control"}),{status:422});
 assert.throws(()=>validateNotificationRecoveryRequest({...base,actorId:""}),{status:422});
});
