import test from "node:test";
import assert from "node:assert/strict";
import {notificationMessage} from "../src/guest-notifications.mjs";

const base={id:"11111111-1111-4111-8111-111111111111",created_at:"2026-10-10T10:00:00Z"};
test("notification projection uses fixed safe messages",()=>{
 const row={...base,event_type:"service.task.assigned",payload:{kind:"market_deliver",assigneeId:"secret-worker",accessCode:"secret-access-code"}};
 assert.equal(notificationMessage(row),"Назначена доставка");
 assert.equal(notificationMessage({...row,payload:{kind:"unknown",assigneeId:"secret-worker"}}),null);
});
test("untrusted statuses and unknown events are never projected",()=>{
 assert.equal(notificationMessage({...base,event_type:"service.order.changed",payload:{to:"<script>alert(1)</script>"}}),null);
 assert.equal(notificationMessage({...base,event_type:"service.order.changed",payload:{to:"completed"}}),"Статус заказа: completed");
 assert.equal(notificationMessage({...base,event_type:"payment.provider.webhook",payload:{card:"secret"}}),null);
});
