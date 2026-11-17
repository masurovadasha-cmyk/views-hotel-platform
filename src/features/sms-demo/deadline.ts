// Display clock only: Core remains authoritative for expiry and replay.
export function deadlineState(deadline:string,now:number,attempted:boolean){
 const remaining=Date.parse(deadline)-now;
 const seconds=Number.isFinite(remaining)?Math.max(0,Math.ceil(remaining/1000)):0;
 return {seconds,canSubmit:attempted||seconds>0};
}
