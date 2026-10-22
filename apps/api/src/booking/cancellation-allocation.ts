export type CapturedFunds={id:string;paymentIntentId:string;capturedMinor:bigint;refundedMinor:bigint};
/** Retain at most the contractual penalty from money actually collected. A
 * partially paid reservation must not receive money that was never collected. */
export function allocateCancellation(totalMinor:bigint,policyRefundMinor:bigint,captures:CapturedFunds[]){
 if(totalMinor<0n||policyRefundMinor<0n||policyRefundMinor>totalMinor)throw Error('INVALID_CANCELLATION_AMOUNTS');
 const ids=new Set<string>();let netCollectedMinor=0n;
 for(const c of captures){
  if(ids.has(c.id)||c.capturedMinor<0n||c.refundedMinor<0n||c.refundedMinor>c.capturedMinor)throw Error('CANCELLATION_RECONCILIATION_REQUIRED');
  ids.add(c.id);netCollectedMinor+=c.capturedMinor-c.refundedMinor;
 }
 if(netCollectedMinor>totalMinor)throw Error('CANCELLATION_RECONCILIATION_REQUIRED');
 const penaltyMinor=totalMinor-policyRefundMinor,refundMinor=netCollectedMinor>penaltyMinor?netCollectedMinor-penaltyMinor:0n;
 let remaining=refundMinor;
 const limits=captures.map(c=>{
  const available=c.capturedMinor-c.refundedMinor,amount=remaining<available?remaining:available;remaining-=amount;
  return {...c,refundLimitMinor:c.refundedMinor+amount,reclassificationMinor:amount};
 });
 return {penaltyMinor,netCollectedMinor,refundMinor,limits};
}
