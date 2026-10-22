import {calendarDay,stayNights} from '../../domain/bookingQuote';
export {stayNights};
// Continued from PR #79's nextStaySelection: invalid/past dates cannot enter a draft.
export function nextStaySelection(start:string,end:string,chosen:string,min:string):[string,string]{
 if(calendarDay(chosen)===null||chosen<min)return [start,end];
 if(!start||end||chosen<=start)return [chosen,''];
 return [start,chosen];
}
export function propertyDay(now=new Date(),timezone='Asia/Tashkent'){
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
 const get=(type:string)=>parts.find(p=>p.type===type)!.value;
 return `${get('year')}-${get('month')}-${get('day')}`;
}
