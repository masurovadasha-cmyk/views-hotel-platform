'use strict';
// Do not expose policy internals, provider correlations, account or document data.
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const money=v=>typeof v==='string'&&/^(0|[1-9][0-9]{0,18})$/.test(v)&&BigInt(v)<=9223372036854775807n;
const date=v=>typeof v==='string'&&Number.isFinite(Date.parse(v));
module.exports=function project(b,kind){
 if(!b||!UUID.test(b.reservationId)||!money(b.refundMinor)||!money(b.penaltyMinor)
  ||typeof b.currency!=='string'||! /^[A-Z]{3}$/.test(b.currency)||!['pending','not_required'].includes(b.refundStatus))throw Error('INVALID_RESPONSE');
 const common={reservationId:b.reservationId,currency:b.currency,refundMinor:b.refundMinor,penaltyMinor:b.penaltyMinor,refundStatus:b.refundStatus};
 if(kind==='confirm'){
  if(!UUID.test(b.cancellationId)||b.status!=='cancelled'||typeof b.idempotentReplay!=='boolean')throw Error('INVALID_RESPONSE');
  return {...common,cancellationId:b.cancellationId,status:'cancelled',idempotentReplay:b.idempotentReplay};
 }
 if(kind!=='preview'||!UUID.test(b.quoteId)||!money(b.totalMinor)||!money(b.netCollectedMinor)||!Number.isInteger(b.refundBps)||b.refundBps<0||b.refundBps>10000
  ||typeof b.policyTimezone!=='string'||b.policyTimezone.length>100||!date(b.checkInAt)||!date(b.expiresAt))throw Error('INVALID_RESPONSE');
 return {...common,quoteId:b.quoteId,totalMinor:b.totalMinor,netCollectedMinor:b.netCollectedMinor,refundBps:b.refundBps,policyTimezone:b.policyTimezone,checkInAt:b.checkInAt,expiresAt:b.expiresAt};
};
