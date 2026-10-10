export function stayNights(start:string,end:string):number{
 const valid=/^\d{4}-\d{2}-\d{2}$/;
 if(!valid.test(start)||!valid.test(end))return 0;
 const a=Date.parse(start+"T00:00:00Z"),b=Date.parse(end+"T00:00:00Z");
 if(!Number.isFinite(a)||!Number.isFinite(b)||b<=a)return 0;
 return Math.round((b-a)/86400000);
}
export function nextStaySelection(start:string,end:string,chosen:string,today:string):[string,string]{
 if(chosen<today)return [start,end];
 if(!start||end||chosen<=start)return [chosen,""];
 return [start,chosen];
}
