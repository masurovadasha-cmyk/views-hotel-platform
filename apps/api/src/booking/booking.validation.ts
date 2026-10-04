import type {CreateHoldInput,PriceLineInput} from "./booking.types";

export function validatePriceLines(lines:PriceLineInput[],currency:string){
  if(!/^[A-Z]{3}$/.test(currency))throw new Error("INVALID_CURRENCY");
  if(lines.length===0)throw new Error("PRICE_LINES_REQUIRED");
  let total=0n;
  for(const line of lines){
    if(line.currency!==currency)throw new Error("MIXED_CURRENCY");
    if(line.amountMinor<0n)throw new Error("NEGATIVE_PRICE_LINE");
    if(!line.type.trim())throw new Error("PRICE_LINE_TYPE_REQUIRED");
    total+=line.amountMinor;
  }
  return total;
}

export function validateHoldInput(input:CreateHoldInput){
  const start=new Date(input.checkInAt),end=new Date(input.checkOutAt);
  if(!Number.isFinite(start.getTime())||!Number.isFinite(end.getTime())||end<=start)throw new Error("INVALID_STAY_PERIOD");
  if(!input.idempotencyKey.trim()||input.idempotencyKey.length>160)throw new Error("INVALID_IDEMPOTENCY_KEY");
  const ttl=input.ttlSeconds??900;
  if(!Number.isInteger(ttl)||ttl<60||ttl>3600)throw new Error("INVALID_HOLD_TTL");
  return {start,end,ttl,totalMinor:validatePriceLines(input.priceLines,input.currency)};
}
