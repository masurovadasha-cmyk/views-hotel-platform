// A stay is counted in calendar dates, independent of the guest device's timezone.
// Round-trip validation prevents Date.parse from normalizing e.g. February 30.
export function calendarDay(value:string):number|null{
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||value.startsWith('0000'))return null;
  const time=Date.parse(value+'T00:00:00Z');
  return Number.isFinite(time)&&new Date(time).toISOString().slice(0,10)===value?time:null;
}

export function stayNights(checkIn:string,checkOut:string):number{
  const start=calendarDay(checkIn),end=calendarDay(checkOut);
  return start!==null&&end!==null&&end>start?(end-start)/86400000:0;
}

export function bookingQuote(input:{
  nightlyRate:number|null; checkIn:string; checkOut:string; capacity:number; guests:number;
  paymentProviderConnected?:boolean;
}){
  const nights=stayNights(input.checkIn,input.checkOut);
  const guestCountValid=Number.isInteger(input.guests)&&input.guests>=1&&input.guests<=input.capacity;
  const rateAvailable=input.nightlyRate!==null&&Number.isFinite(input.nightlyRate)&&input.nightlyRate>=0;
  const total=rateAvailable&&nights>0?Number(input.nightlyRate)*nights:null;
  const canContinue=nights>0&&guestCountValid;
  const canPay=canContinue&&total!==null&&input.paymentProviderConnected===true;
  return {nights,guestCountValid,rateAvailable,total,canContinue,canPay};
}
