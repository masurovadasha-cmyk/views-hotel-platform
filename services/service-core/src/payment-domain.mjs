export const paymentTransitions=Object.freeze({
 created:["pending","failed","cancelled"],
 pending:["succeeded","failed","cancelled"],
 succeeded:[],
 failed:[],
 cancelled:[]
});
export function canMovePayment(from,to){
 return paymentTransitions[from]?.includes(to)===true;
}
export function validatePaymentAmount(value){
 if(!Number.isSafeInteger(value)||value<=0)throw Error("Invalid payment amount");
 return value;
}
export function validateRefund({capturedUzs,refundedUzs,requestedUzs}){
 for(const value of [capturedUzs,refundedUzs,requestedUzs]){
  if(!Number.isSafeInteger(value)||value<0)throw Error("Invalid refund amount");
 }
 if(requestedUzs===0||requestedUzs>capturedUzs-refundedUzs)throw Error("Refund exceeds captured amount");
 return true;
}
