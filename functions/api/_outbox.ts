export const OUTBOX_CONSUMER="stage4-internal-audit";
export const OUTBOX_MAX_ATTEMPTS=5;

export function outboxBackoffSeconds(attempt:number){
  const safe=Math.max(1,Math.min(OUTBOX_MAX_ATTEMPTS,Math.floor(attempt)));
  return [0,30,120,600,1800,3600][safe]??3600;
}

export function parseOutboxPayload(raw:string){
  const value=JSON.parse(raw);
  if(value===null||typeof value!=="object")throw new Error("OUTBOX_PAYLOAD_NOT_OBJECT");
  return value as Record<string,unknown>;
}

export function nextAvailableAt(attempt:number,now=Date.now()){
  return new Date(now+outboxBackoffSeconds(attempt)*1000).toISOString();
}
