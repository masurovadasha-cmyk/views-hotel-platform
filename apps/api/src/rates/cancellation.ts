export type CancellationRule={minHoursBeforeCheckIn:number;refundBps:number};
export type CancellationPolicySnapshot={
  version:1;
  propertyTimezone:string;
  rules:CancellationRule[];
  nonRefundableLineCodes:string[];
};

export type CancellationLine={code:string;amountMinor:bigint;refundable:boolean};

export function validateCancellationPolicy(policy:CancellationPolicySnapshot){
  if(policy.version!==1)throw new Error("UNSUPPORTED_CANCELLATION_POLICY");
  if(!policy.propertyTimezone)throw new Error("POLICY_TIMEZONE_REQUIRED");
  if(!policy.rules.length)throw new Error("CANCELLATION_RULES_REQUIRED");
  for(const rule of policy.rules){
    if(rule.minHoursBeforeCheckIn<0||rule.refundBps<0||rule.refundBps>10000)throw new Error("INVALID_CANCELLATION_RULE");
  }
  return {...policy,rules:[...policy.rules].sort((a,b)=>b.minHoursBeforeCheckIn-a.minHoursBeforeCheckIn)};
}

export function calculateCancellationRefund(input:{
  policy:CancellationPolicySnapshot;
  requestedAt:string;
  checkInAt:string;
  lines:CancellationLine[];
}){
  const policy=validateCancellationPolicy(input.policy);
  const requested=new Date(input.requestedAt),checkIn=new Date(input.checkInAt);
  if(!Number.isFinite(requested.getTime())||!Number.isFinite(checkIn.getTime()))throw new Error("INVALID_CANCELLATION_TIME");
  const hoursBefore=(checkIn.getTime()-requested.getTime())/3600000;
  const rule=policy.rules.find(x=>hoursBefore>=x.minHoursBeforeCheckIn);
  const refundBps=hoursBefore<0?0:(rule?.refundBps??0);
  const eligible=input.lines
    .filter(x=>x.refundable&&!policy.nonRefundableLineCodes.includes(x.code))
    .reduce((sum,x)=>sum+x.amountMinor,0n);
  const refund=(eligible*BigInt(refundBps))/10000n;
  return {hoursBeforeCheckIn:hoursBefore,refundBps,eligibleMinor:eligible,refundMinor:refund};
}
