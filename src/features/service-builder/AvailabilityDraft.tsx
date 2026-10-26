import {useEffect,useState} from 'react';
import {availabilityZones,checkAvailability,parseWindowTime,validateAvailability,windowTime,type Availability} from './availability';
import {translate} from './messages';
import type {Locale} from './model';
export type RawWindowTimes=Record<number,{start?:string;end?:string}>;
function TimeInput({text,end=false,onChange}:{text:string;end?:boolean;onChange:(text:string)=>void}){
 return <input data-testid={end?'availability-end':'availability-start'} type="text" maxLength={32} placeholder="HH:MM" value={text} onChange={e=>onChange(e.target.value)}/>;
}
export function AvailabilityDraft({locale,value,onChange,rawTimes,onRawChange}:{locale:Locale;value:Availability|null;onChange:(value:Availability|null)=>void;rawTimes:RawWindowTimes;onRawChange:(value:RawWindowTimes)=>void}){
 const t=(key:string)=>translate(locale,key),[sample,setSample]=useState(''),[result,setResult]=useState<ReturnType<typeof checkAvailability>|null>(null),[error,setError]=useState(''),[rowsEpoch,setRowsEpoch]=useState(0);
 useEffect(()=>{setResult(null);setError('');},[value]);
 let valid=true;try{validateAvailability(value);}catch{valid=false;}
 function change(next:Availability|null){setResult(null);setError('');onChange(next);}
 function check(){setResult(null);setError('');try{setResult(checkAvailability(value,sample));}catch(e){setError(e instanceof Error?e.message:'invalid');}}
 const errors:Record<string,string>={time:'Enter a real local date and time: YYYY-MM-DDTHH:MM, years 2000–2099.',ambiguous:'This local time or window boundary occurs twice. Choose an unambiguous time.',nonexistent:'This local time or window boundary does not exist. Choose another time.',timezone:'This device cannot safely resolve the selected timezone.',unconfigured:'No draft hours configured.',invalid:'Complete the timezone and 1–14 non-overlapping same-day windows.'};
 return <section data-testid="builder-availability"><h4>{t('Unpublished weekly hours')}</h4><p>{t('Calendar check only, not service availability, capacity, a booking or an order promise. No publication or activation.')}</p>
 <label>{t('Draft hours mode')}<select data-testid="builder-availability-mode" value={value?'weekly':'none'} onChange={e=>{setRowsEpoch(n=>n+1);onRawChange({});change(e.target.value==='weekly'?{kind:'weekly',timezone:'',windows:[]}:null);}}><option value="none">{t('No draft hours configured.')}</option><option value="weekly">{t('Weekly draft hours')}</option></select></label>
 {value&&<><label>{t('Draft timezone')}<select data-testid="builder-availability-zone" value={value.timezone} onChange={e=>change({...value,timezone:e.target.value})}><option value="">{t('Choose a timezone')}</option>{availabilityZones.map(zone=><option key={zone} value={zone}>{zone}</option>)}</select></label>
 <p>{t('Each window stays within one day. Start is included; end is excluded. 24:00 is an end boundary only. No default business hours.')}</p>
 {value.windows.map((w,i)=><div data-testid="builder-availability-window" className="builderField" key={rowsEpoch+':'+i}><label>{t('Weekday')}<select data-testid="availability-day" value={w.day} onChange={e=>change({...value,windows:value.windows.map((x,j)=>j===i?{...x,day:Number(e.target.value)}:x)})}><option value={0}>{t('Choose a weekday')}</option>{['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].map((day,d)=><option key={day} value={d+1}>{t(day)}</option>)}</select></label><label>{t('Window start')}<TimeInput text={rawTimes[i]?.start??windowTime(w.startMinute)} onChange={text=>{onRawChange({...rawTimes,[i]:{...rawTimes[i],start:text}});change({...value,windows:value.windows.map((x,j)=>j===i?{...x,startMinute:parseWindowTime(text)}:x)});}}/></label><label>{t('Window end')}<TimeInput end text={rawTimes[i]?.end??windowTime(w.endMinute)} onChange={text=>{onRawChange({...rawTimes,[i]:{...rawTimes[i],end:text}});change({...value,windows:value.windows.map((x,j)=>j===i?{...x,endMinute:parseWindowTime(text,true)}:x)});}}/></label><button onClick={()=>{setRowsEpoch(n=>n+1);const next:RawWindowTimes={};for(const key of Object.keys(rawTimes)){const row=Number(key);if(row!==i)next[row>i?row-1:row]=rawTimes[row];}onRawChange(next);change({...value,windows:value.windows.filter((_,j)=>i!==j)});}}>{t('Remove window')} {i+1}</button></div>)}
 <button data-testid="builder-availability-add" disabled={value.windows.length>=14} onClick={()=>change({...value,windows:[...value.windows,{day:0,startMinute:-1,endMinute:-1}]})}>{t('Add window')}</button>
 {!valid&&<p role="status">{t(errors.invalid)}</p>}
 <label>{t('Synthetic local date and time')}<input data-testid="builder-availability-sample" type="text" maxLength={32} placeholder="YYYY-MM-DDTHH:MM" value={sample} onChange={e=>{setSample(e.target.value);setResult(null);setError('');}}/></label>
 <button data-testid="builder-availability-check" disabled={!valid} onClick={check}>{t('Check unpublished hours')}</button>
 {error&&<p role="status" data-testid="builder-availability-error">{t(errors[error]||errors.invalid)}</p>}
 {result&&<output data-testid="builder-availability-result" data-status={result.status} data-instant={result.instant} aria-live="polite">{t(result.status==='inside'?'Inside configured draft hours':'Outside configured draft hours')} · {result.sampleLocal} · {result.timezone} · {result.instant}</output>}</>}
 </section>;
}
