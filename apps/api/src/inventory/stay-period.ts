export type StayPeriod={checkInAt:string;checkOutAt:string};
export function validateStayPeriod(input:StayPeriod){
 const start=new Date(input.checkInAt),end=new Date(input.checkOutAt);
 if(!Number.isFinite(start.getTime())||!Number.isFinite(end.getTime()))throw new Error("INVALID_STAY_PERIOD");
 if(end<=start)throw new Error("INVALID_STAY_PERIOD");
 return {start,end,durationMs:end.getTime()-start.getTime()};
}
