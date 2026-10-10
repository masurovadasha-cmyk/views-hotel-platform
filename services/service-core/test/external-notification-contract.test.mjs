import test from "node:test";
import assert from "node:assert/strict";
import {validateExternalNotification,createSandboxNotificationTransport} from "../src/external-notification-contract.mjs";
const command={channel:"push",consentId:"consent-1",recipientRef:"guest:abc",templateId:"order.status",idempotencyKey:"delivery-123"};
test("external notifications require consent and safe template references",()=>{
 assert.equal(validateExternalNotification(command).channel,"push");
 assert.throws(()=>validateExternalNotification({...command,consentId:""}),/Consent/);
 assert.throws(()=>validateExternalNotification({...command,phone:"+998901234567"}),/Raw recipient/);
 assert.throws(()=>validateExternalNotification({...command,channel:"other"}),/Invalid channel/);
});
test("sandbox never sends and deduplicates delivery references",async()=>{
 const sender=createSandboxNotificationTransport();
 const first=await sender.send(command);
 const again=await sender.send(command);
 assert.equal(first.status,"sandbox_accepted");
 assert.equal(again.replayed,true);
 await assert.rejects(sender.send({...command,templateId:"order.cancelled"}),/Idempotency conflict/);
});
