import test from "node:test";
import assert from "node:assert/strict";
import {publicOrderEvent} from "../src/guest-order-timeline.mjs";

test("guest timeline strips employee identity and raw event payload",()=>{
 const row={id:"event-1",event_type:"service.task.assigned",created_at:"2026-10-10T09:00:00Z",payload:{kind:"market_deliver",assigneeId:"private-staff",actorId:"private-manager",taskId:"private-task",secret:"private"}};
 assert.deepEqual(publicOrderEvent(row),{id:"event-1",type:"service.task.assigned",at:"2026-10-10T09:00:00Z",taskKind:"market_deliver"});
 assert.equal(JSON.stringify(publicOrderEvent(row)).includes("private"),false);
});
test("unknown operational events never appear in guest timeline",()=>{
 assert.equal(publicOrderEvent({id:"e",event_type:"payment.provider.webhook",payload:{token:"private"},created_at:"2026-10-10T09:00:00Z"}),null);
});
test("guest timeline only exposes selected order state fields",()=>{
 assert.deepEqual(publicOrderEvent({id:"event-2",event_type:"service.order.changed",created_at:"2026-10-10T09:00:00Z",payload:{to:"in_progress",actorId:"private"}}),{id:"event-2",type:"service.order.changed",at:"2026-10-10T09:00:00Z",status:"in_progress"});
});
