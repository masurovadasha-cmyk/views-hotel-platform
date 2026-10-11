import {describe,expect,it} from "vitest";
import {nextPaymentStatus} from "./payment-state";

describe("payment state machine",()=>{
 it("moves hosted checkout to pending provider",()=>expect(nextPaymentStatus("requires_payment","checkout_created")).toBe("pending_provider"));
 it("captures fully when captured amount reaches intent",()=>expect(nextPaymentStatus("authorized","captured",{capturedMinor:100n,refundedMinor:0n,amountMinor:100n})).toBe("captured"));
 it("supports partial refunds",()=>expect(nextPaymentStatus("refund_pending","refund_succeeded",{capturedMinor:100n,refundedMinor:40n,amountMinor:100n})).toBe("partially_refunded"));
 it("rejects impossible transitions",()=>expect(()=>nextPaymentStatus("failed","captured",{capturedMinor:100n,refundedMinor:0n,amountMinor:100n})).toThrow("INVALID_PAYMENT_TRANSITION"));
});
