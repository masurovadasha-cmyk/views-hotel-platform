export function bookingQuote(input:{
  nightlyRate:number|null; checkIn:string; checkOut:string; capacity:number; guests:number;
  paymentProviderConnected?:boolean;
}){
  const start=input.checkIn?new Date(input.checkIn+"T00:00:00"):null;
  const end=input.checkOut?new Date(input.checkOut+"T00:00:00"):null;
  const raw=start&&end?Math.ceil((end.getTime()-start.getTime())/86400000):0;
  const nights=Number.isFinite(raw)&&raw>0?raw:0;
  const guestCountValid=Number.isInteger(input.guests)&&input.guests>=1&&input.guests<=input.capacity;
  const rateAvailable=input.nightlyRate!==null&&Number.isFinite(input.nightlyRate)&&input.nightlyRate>=0;
  const total=rateAvailable&&nights>0?Number(input.nightlyRate)*nights:null;
  const canContinue=nights>0&&guestCountValid;
  const canPay=canContinue&&total!==null&&input.paymentProviderConnected===true;
  return {nights,guestCountValid,rateAvailable,total,canContinue,canPay};
}
