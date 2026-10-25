export const serviceKinds=['cleaning','laundry','market','concierge'] as const;
export const milestones=['response','acceptance','completion'] as const;
export const zones=['UTC','Asia/Tashkent','Europe/Berlin','America/New_York'] as const;
export type Policy={serviceKind:typeof serviceKinds[number];milestone:typeof milestones[number];timezone:typeof zones[number];targetMinutes:number;windows:{day:number;startMinute:number;endMinute:number}[]};
const invalid=(code='INVALID_SLA_POLICY'):never=>{throw Error(code);};
export function exact(value:unknown,keys:string[]){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join(',')!==keys.sort().join(','))return invalid();return value as Record<string,unknown>;}
export function policy(value:unknown):Policy{
 const p=exact(value,['serviceKind','milestone','timezone','targetMinutes','windows']);
 if(!serviceKinds.includes(p.serviceKind as any)||!milestones.includes(p.milestone as any)||!zones.includes(p.timezone as any)||!Number.isSafeInteger(p.targetMinutes)||Number(p.targetMinutes)<1||Number(p.targetMinutes)>1440||!Array.isArray(p.windows)||!p.windows.length||p.windows.length>14)return invalid();
 const windows=p.windows.map(v=>{const w=exact(v,['day','startMinute','endMinute']);if(![w.day,w.startMinute,w.endMinute].every(Number.isSafeInteger)||Number(w.day)<1||Number(w.day)>7||Number(w.startMinute)<0||Number(w.endMinute)>1440||Number(w.startMinute)>=Number(w.endMinute))return invalid();return {day:Number(w.day),startMinute:Number(w.startMinute),endMinute:Number(w.endMinute)};}).sort((a,b)=>a.day-b.day||a.startMinute-b.startMinute);
 for(let i=1;i<windows.length;i++)if(windows[i-1].day===windows[i].day&&windows[i-1].endMinute>windows[i].startMinute)return invalid();
 return {serviceKind:p.serviceKind as Policy['serviceKind'],milestone:p.milestone as Policy['milestone'],timezone:p.timezone as Policy['timezone'],targetMinutes:Number(p.targetMinutes),windows};
}
const formatters=new Map<string,Intl.DateTimeFormat>();
function parts(at:number,zone:string){let f=formatters.get(zone);if(!f){f=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});formatters.set(zone,f);}const p=Object.fromEntries(f.formatToParts(at).map(x=>[x.type,x.value]));return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;}
function wall(value:string){if(!/^20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))return invalid('INVALID_SLA_LOCAL_TIME');const ms=Date.parse(value+'Z');if(!Number.isFinite(ms)||new Date(ms).toISOString().slice(0,16)!==value)return invalid('INVALID_SLA_LOCAL_TIME');return ms;}
export function localInstant(value:string,zone:Policy['timezone']){
 const ms=wall(value),offsets=new Set<number>();
 for(let h=-36;h<=36;h+=6){const at=ms+h*3600000;offsets.add(Date.parse(parts(at,zone)+'Z')-at);}
 const matches=[...offsets].map(offset=>ms-offset).filter(at=>parts(at,zone)===value);
 if(matches.length!==1)return invalid(matches.length?'SLA_LOCAL_TIME_AMBIGUOUS':'SLA_LOCAL_TIME_NONEXISTENT');return matches[0];
}
const localAt=(day:number,minute:number)=>new Date(day+minute*60000).toISOString().slice(0,16);
export function simulate(config:Policy,startLocal:string){
 const start=localInstant(startLocal,config.timezone),firstDay=wall(startLocal.slice(0,10)+'T00:00');let remaining=config.targetMinutes,cursor=start;
 const segments:{start:string;end:string;minutes:number;localStart:string;localEnd:string}[]=[];
 for(let offset=0;offset<366&&remaining>0;offset++){
  const day=firstDay+offset*86400000,weekday=new Date(day).getUTCDay()||7;
  for(const w of config.windows.filter(w=>w.day===weekday)){
   const a=localInstant(localAt(day,w.startMinute),config.timezone),b=localInstant(localAt(day,w.endMinute),config.timezone);
   if(b<=a)return invalid('INVALID_SLA_WINDOW');const begin=Math.max(a,cursor);if(begin>=b)continue;
   const minutes=Math.min(remaining,(b-begin)/60000),end=begin+minutes*60000;
   segments.push({start:new Date(begin).toISOString(),end:new Date(end).toISOString(),minutes,localStart:parts(begin,config.timezone),localEnd:parts(end,config.timezone)});remaining-=minutes;cursor=end;if(!remaining)break;
  }
 }
 if(remaining)return invalid('SLA_SIMULATION_HORIZON');
 return {simulationOnly:true as const,approved:false as const,timezone:config.timezone,startLocal,startAt:new Date(start).toISOString(),dueAt:new Date(cursor).toISOString(),dueLocal:parts(cursor,config.timezone),targetMinutes:config.targetMinutes,segments};
}
