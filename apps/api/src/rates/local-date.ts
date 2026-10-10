function localParts(instant:string,timeZone:string){
  const date=new Date(instant);
  if(!Number.isFinite(date.getTime()))throw new Error("INVALID_INSTANT");
  const parts=new Intl.DateTimeFormat("en-CA",{
    timeZone,year:"numeric",month:"2-digit",day:"2-digit"
  }).formatToParts(date);
  const get=(type:string)=>parts.find(x=>x.type===type)?.value;
  const year=get("year"),month=get("month"),day=get("day");
  if(!year||!month||!day)throw new Error("INVALID_TIMEZONE");
  return `${year}-${month}-${day}`;
}

export function localDateOf(instant:string,timeZone:string){return localParts(instant,timeZone)}

export function addLocalDays(date:string,days:number){
  const match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if(!match)throw new Error("INVALID_LOCAL_DATE");
  const d=new Date(Date.UTC(Number(match[1]),Number(match[2])-1,Number(match[3])+days));
  return d.toISOString().slice(0,10);
}

export function enumerateStayDates(checkInAt:string,checkOutAt:string,timeZone:string){
  const start=localDateOf(checkInAt,timeZone),end=localDateOf(checkOutAt,timeZone);
  const dates:string[]=[];
  for(let date=start;date<end;date=addLocalDays(date,1)){
    dates.push(date);
    if(dates.length>730)throw new Error("STAY_TOO_LONG");
  }
  if(!dates.length)throw new Error("INVALID_STAY_PERIOD");
  return {dates,arrivalDate:start,departureDate:end};
}

export function isoWeekday(date:string){
  const d=new Date(date+"T00:00:00Z").getUTCDay();
  return d===0?7:d;
}

export function calendarDaysBetween(fromInstant:string,toLocalDate:string,timeZone:string){
  const from=localDateOf(fromInstant,timeZone);
  const a=Date.parse(from+"T00:00:00Z"),b=Date.parse(toLocalDate+"T00:00:00Z");
  return Math.floor((b-a)/86400000);
}
