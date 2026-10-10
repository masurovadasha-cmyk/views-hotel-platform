import test from "node:test";import assert from "node:assert/strict";
import {canMovePayment,validatePaymentAmount,validateRefund} from "../src/payment-domain.mjs";
test("payment transitions are forward-only",()=>{
 assert.equal(canMovePayment("created","pending"),true);
 assert.equal(canMovePayment("pending","succeeded"),true);
 assert.equal(canMovePayment("succeeded","pending"),false);
 assert.equal(canMovePayment("failed","succeeded"),false);
});
test("payment amount must be positive safe integer",()=>{
 assert.equal(validatePaymentAmount(190000),190000);
 assert.throws(()=>validatePaymentAmount(0),/Invalid/);
 assert.throws(()=>validatePaymentAmount(Number.MAX_SAFE_INTEGER+1),/Invalid/);
});
test("refund cannot exceed remaining captured funds",()=>{
 assert.equal(validateRefund({capturedUzs:190000,refundedUzs:4000,requestedUzs:186000}),true);
 assert.throws(()=>validateRefund({capturedUzs:190000,refundedUzs:4000,requestedUzs:186001}),/exceeds/);
});
