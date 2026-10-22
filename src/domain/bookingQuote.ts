// A stay is counted in calendar dates, independent of the guest device's timezone.
// Round-trip validation prevents Date.parse from normalizing e.g. February 30.
function calendarDay(value:string):number|null{
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||value.startsWith('0000'))return null;
  const time=Date.parse(value+'T00:00:00Z');
  return Number.isFinite(time)&&new Date(time).toISOString().slice(0,10)===value?time:null;
}

export function bookingQuote(input:{
  nightlyRate:number|null; checkIn:string; checkOut:string; capacity:number; guests:number;
  paymentProviderConnected?:boolean;
}){
  const start=calendarDay(input.checkIn),end=calendarDay(input.checkOut);
  const raw=start!==null&&end!==null?(end-start)/86400000:0;
  const nights=Number.isFinite(raw)&&raw>0?raw:0;
  const guestCountValid=Number.isInteger(input.guests)&&input.guests>=1&&input.guests<=input.capacity;
  const rateAvailable=input.nightlyRate!==null&&Number.isFinite(input.nightlyRate)&&input.nightlyRate>=0;
  const total=rateAvailable&&nights>0?Number(input.nightlyRate)*nights:null;
  const canContinue=nights>0&&guestCountValid;
  const canPay=canContinue&&total!==null&&input.paymentProviderConnected===true;
  return {nights,guestCountValid,rateAvailable,total,canContinue,canPay};
}
