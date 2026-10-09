import test from "node:test";import assert from "node:assert/strict";
import {priceWithMarkup,allocateFefo,canTransition} from "../src/domain.mjs";
test("25 percent markup",()=>assert.equal(priceWithMarkup(12000),15000));
test("FEFO excludes expired and blocked",()=>assert.deepEqual(allocateFefo([{id:"late",onHand:10,reserved:0,expiresAt:"2026-10-20"},{id:"early",onHand:8,reserved:2,expiresAt:"2026-10-12"},{id:"old",onHand:50,reserved:0,expiresAt:"2026-10-01"}],9),[{lotId:"early",quantity:6},{lotId:"late",quantity:3}]));
test("insufficient inventory",()=>assert.throws(()=>allocateFefo([{id:"a",onHand:2,reserved:1}],2),/Insufficient/));
test("state transitions",()=>{assert.equal(canTransition("draft","awaiting_payment"),true);assert.equal(canTransition("completed","draft"),false)});
