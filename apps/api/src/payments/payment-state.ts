import type {PaymentStatus} from "./payment.types";

export type PaymentEvent="checkout_created"|"authorized"|"captured"|"failed"|"cancelled"|"refund_requested"|"refund_succeeded";

export function nextPaymentStatus(current:PaymentStatus,event:PaymentEvent,amounts?:{capturedMinor:bigint;refundedMinor:bigint;amountMinor:bigint}):PaymentStatus{
  if(event==="checkout_created"&&current==="requires_payment")return "pending_provider";
  if(event==="authorized"&&["requires_payment","pending_provider"].includes(current))return "authorized";
  if(event==="captured"&&["requires_payment","pending_provider","authorized","partially_captured"].includes(current)){
    if(!amounts)throw new Error("PAYMENT_AMOUNTS_REQUIRED");
    return amounts.capturedMinor>=amounts.amountMinor?"captured":"partially_captured";
  }
  if(event==="failed"&&["requires_payment","pending_provider","authorized"].includes(current))return "failed";
  if(event==="cancelled"&&["requires_payment","pending_provider","authorized"].includes(current))return "cancelled";
  if(event==="refund_requested"&&["captured","partially_refunded"].includes(current))return "refund_pending";
  if(event==="refund_succeeded"&&["captured","refund_pending","partially_refunded"].includes(current)){
    if(!amounts)throw new Error("PAYMENT_AMOUNTS_REQUIRED");
    return amounts.refundedMinor>=amounts.capturedMinor?"refunded":"partially_refunded";
  }
  throw new Error("INVALID_PAYMENT_TRANSITION");
}
