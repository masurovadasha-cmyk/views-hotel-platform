import type {CreateHoldInput} from "./booking.types";

export function validateHoldInput(input:CreateHoldInput){
  if(!input.idempotencyKey.trim()||input.idempotencyKey.length>160)throw new Error("INVALID_IDEMPOTENCY_KEY");
  const ttl=input.ttlSeconds??900;
  if(!Number.isInteger(ttl)||ttl<60||ttl>3600)throw new Error("INVALID_HOLD_TTL");
  return {ttl};
}
