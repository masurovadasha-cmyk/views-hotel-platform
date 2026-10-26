// Unpublished calendar membership only. Not capacity, a slot, or an order promise.
export const availabilityZones=['UTC','Asia/Tashkent','Europe/Berlin','America/New_York'] as const;
export type Availability={kind:'weekly';timezone:string;windows:{day:number;startMinute:number;endMinute:number}[]};
const invalid=(code='invalid'):never=>{throw Error(code);};
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
export function validateAvailability(value:unknown):Availability|null{
 if(value===null)return null;
 if(!object(value)||Object.keys(value).sort().join()!=='kind,timezone,windows'||value.kind!=='weekly'||!availabilityZones.includes(value.timezone as typeof availabilityZones[number])||!Array.isArray(value.windows)||value.windows.length<1||value.windows.length>14)return invalid();
 const windows=value.windows.map(v=>{if(!object(v)||Object.keys(v).sort().join()!=='day,endMinute,startMinute'||![v.day,v.startMinute,v.endMinute].every(Number.isSafeInteger)||Number(v.day)<1||Number(v.day)>7||Number(v.startMinute)<0||Number(v.endMinute)>1440||Number(v.startMinute)>=Number(v.endMinute))return invalid();return {day:Number(v.day),startMinute:Number(v.startMinute),endMinute:Number(v.endMinute)};});
 const sorted=[...windows].sort((a,b)=>a.day-b.day||a.startMinute-b.startMinute);
 for(let i=1;i<sorted.length;i++)if(sorted[i].day===sorted[i-1].day&&sorted[i].startMinute<sorted[i-1].endMinute)return invalid();
 return {kind:'weekly',timezone:String(value.timezone),windows};
}
export function parseWindowTime(value:string,end=false):number{
 if(end&&value==='24:00')return 1440;
 if(!/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(value))return -1;
 return Number(value.slice(0,2))*60+Number(value.slice(3));
}
export const windowTime=(value:number)=>value<0?'':String(Math.floor(value/60)).padStart(2,'0')+':'+String(value%60).padStart(2,'0');
function wall(value:unknown,boundary=false):number{
 if(typeof value!=='string'||(!/^20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)&&!(boundary&&value==='2100-01-01T00:00')))return invalid('time');
 const ms=Date.parse(value+'Z');if(!Number.isFinite(ms)||new Date(ms).toISOString().slice(0,16)!==value)return invalid('time');return ms;
}
// Adapted from S1's pure localInstant resolver, with fail-closed Intl capability checks.
function localInstant(value:string,zone:string,boundary=false):number{
 const ms=wall(value,boundary);let formatter:Intl.DateTimeFormat;
 try{formatter=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});if(typeof formatter.formatToParts!=='function'||formatter.resolvedOptions().hourCycle!=='h23'||!(formatter.resolvedOptions().timeZone===zone||(zone==='UTC'&&formatter.resolvedOptions().timeZone==='Etc/UTC')))return invalid('timezone');}catch{return invalid('timezone');}
 const parts=(at:number)=>{try{const p:Record<string,string>={};for(const part of formatter.formatToParts(at))p[part.type]=part.value;const text=`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;if(!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d$/.test(text))return invalid('timezone');return text;}catch{return invalid('timezone');}};
 const offsets=new Set<number>();for(let h=-36;h<=36;h+=6){const at=ms+h*3600000;offsets.add(Date.parse(parts(at)+'Z')-at);}
 const matches=[...offsets].map(offset=>ms-offset).filter(at=>parts(at)===value);
 if(matches.length!==1)return invalid(matches.length?'ambiguous':'nonexistent');return matches[0];
}
export function checkAvailability(rule:unknown,sample:unknown){
 const config=validateAvailability(rule);if(!config)return invalid('unconfigured');
 const local=wall(sample),sampleLocal=String(sample),at=localInstant(sampleLocal,config.timezone),day=new Date(local).getUTCDay()||7,minute=new Date(local).getUTCHours()*60+new Date(local).getUTCMinutes();
 // Check relevant boundaries too: a weekly interval cannot silently straddle an invalid endpoint.
 const date=sampleLocal.slice(0,10),midnight=Date.parse(date+'T00:00Z');
 for(const w of config.windows.filter(w=>w.day===day))for(const bound of [w.startMinute,w.endMinute])localInstant(new Date(midnight+bound*60000).toISOString().slice(0,16),config.timezone,true);
 const inside=config.windows.some(w=>w.day===day&&minute>=w.startMinute&&minute<w.endMinute);
 return {simulationOnly:true as const,approved:false as const,status:inside?'inside' as const:'outside' as const,timezone:config.timezone,sampleLocal,instant:new Date(at).toISOString()};
}
