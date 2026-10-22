import {useEffect,useId,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {calendarDay} from '../../domain/bookingQuote';
import {nextStaySelection,propertyDay,stayNights} from './model';
import {calendarLabels,type CalendarLocale} from './labels';
import './stayDateRange.css';

// History entries from an earlier page load must not reopen a new picker instance.
const documentSession=Math.random().toString(36).slice(2);
type Props={checkIn:string;checkOut:string;onChange:(start:string,end:string)=>void;locale?:CalendarLocale;timezone?:string;disabled?:boolean;allowPast?:boolean;maxNights?:number;label?:string};
const iso=(date:Date)=>date.toISOString().slice(0,10);
const date=(value:string)=>new Date(value+'T12:00:00Z');
const monthStart=(value:string)=>value.slice(0,7)+'-01';
const shiftMonth=(value:string,offset:number)=>{const d=date(value);d.setUTCMonth(d.getUTCMonth()+offset);return iso(d);};
/** Shared date-only picker. Drafts never mutate bookings or quote inputs until Save. */
export function StayDateRange({checkIn,checkOut,onChange,locale='en',timezone='Asia/Tashkent',disabled=false,allowPast=false,maxNights,label}:Props){
 const id=useId()+'-'+documentSession,labels=calendarLabels[locale],dialog=useRef<HTMLDialogElement>(null),trigger=useRef<HTMLButtonElement>(null);
 const [open,setOpen]=useState(false),[draft,setDraft]=useState<[string,string]>([checkIn,checkOut]);
 const [firstMonth,setFirstMonth]=useState(()=>monthStart(propertyDay(new Date(),timezone)));
 const [monthCount,setMonthCount]=useState(18),[dark,setDark]=useState(false);
 const latest=useRef({checkIn,checkOut,disabled,timezone});latest.current={checkIn,checkOut,disabled,timezone};
 const today=propertyDay(new Date(),timezone),min=allowPast?'0001-01-01':today;
 const nights=stayNights(...draft),empty=!draft[0]&&!draft[1];
 const valid=empty||(nights>0&&draft[0]>=min&&(!maxNights||nights<=maxNights));
 function initialise(){
  const value=latest.current;if(value.disabled)return;
  setDraft([value.checkIn,value.checkOut]);setDark(!!trigger.current?.closest(".dark"));
  const start=calendarDay(value.checkIn)!==null?value.checkIn:propertyDay(new Date(),value.timezone);
  setFirstMonth(monthStart(start));setMonthCount(18);setOpen(true);
 }
 function show(){
  if(disabled)return;
  history.pushState({...history.state,viewsStayCalendar:id},'');initialise();
 }
 function close(){
  setOpen(false);trigger.current?.focus();
  if(history.state?.viewsStayCalendar===id)history.back();
 }
 useEffect(()=>{
  const changed=()=>{if(history.state?.viewsStayCalendar===id)initialise();else setOpen(false);};
  window.addEventListener('popstate',changed);
  return()=>{window.removeEventListener('popstate',changed);if(history.state?.viewsStayCalendar===id){const state={...history.state};delete state.viewsStayCalendar;history.replaceState(state,'');}};
 },[id]);
 useEffect(()=>{if(disabled&&open)close();},[disabled]);
 useEffect(()=>{
  if(!open)return;const element=dialog.current!;element.showModal();
  return()=>{element.close();if(trigger.current?.isConnected)trigger.current.focus();};
 },[open]);
 const months=Array.from({length:monthCount},(_,i)=>date(shiftMonth(firstMonth,i)));
 const formatMonth=(d:Date)=>new Intl.DateTimeFormat(locale,{month:'long',year:'numeric',timeZone:'UTC'}).format(d);
 const weekdays=Array.from({length:7},(_,i)=>new Intl.DateTimeFormat(locale,{weekday:'short',timeZone:'UTC'}).format(new Date(Date.UTC(2026,0,5+i))));
 const summary=(a:string,b:string)=>`${a||labels.start} — ${b||labels.end}${stayNights(a,b)?' · '+labels.nights+': '+stayNights(a,b):''}`;
 return <div className="stayDateRange" data-testid="stay-date-range">
  <button ref={trigger} type="button" disabled={disabled} onClick={show} aria-label={label||labels.choose} aria-haspopup="dialog">{summary(checkIn,checkOut)}</button>
  {open&&createPortal(<dialog ref={dialog} data-stay-calendar data-testid="stay-calendar" className={"stayDateDialog"+(dark?" dark":"")} aria-label={labels.title}
   onCancel={event=>{event.preventDefault();close();}} onClick={event=>{if(event.target===event.currentTarget)close();}}
   onKeyDown={event=>{event.stopPropagation();if(event.key==='Escape'){event.preventDefault();close();}if(event.key==='Tab'){
    const items=[...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')],first=items[0],last=items[items.length-1];
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
   }}}>
   <div className="stayDateDialogCard">
    <header><h2>{labels.title}</h2><button type="button" data-testid="stay-calendar-cancel" onClick={close}>{labels.close}</button></header>
    <p className="stayDateSummary" aria-live="polite">{summary(...draft)}</p><small>{labels.zone}: {timezone}. {labels.hint}</small>
    <div className="stayDateMonths">
     <button type="button" disabled={(!allowPast&&firstMonth<=monthStart(today))||firstMonth<='0002-01-01'} onClick={()=>{setFirstMonth(shiftMonth(firstMonth,-12));setMonthCount(18);}}>{labels.earlier}</button>
     {months.map(m=>{
      const year=m.getUTCFullYear(),month=m.getUTCMonth(),offset=(m.getUTCDay()+6)%7,count=new Date(Date.UTC(year,month+1,0)).getUTCDate();
      return <section key={iso(m)} aria-label={formatMonth(m)}><h3>{formatMonth(m)}</h3><div className="stayDateGrid">
       {weekdays.map((w,i)=><small key={i}>{w}</small>)}{Array.from({length:offset},(_,i)=><span key={'pad'+i}/>)}
       {Array.from({length:count},(_,i)=>{const value=iso(new Date(Date.UTC(year,month,i+1,12))),edge=value===draft[0]||value===draft[1],inside=!!draft[1]&&value>draft[0]&&value<draft[1];
        return <button type="button" key={value} data-date={value} disabled={value<min||disabled} aria-label={value} aria-pressed={edge||inside} aria-current={value===today?'date':undefined}
         className={(edge?'edge ':'')+(inside?'inside':'')} onClick={()=>setDraft(nextStaySelection(...draft,value,min))}>{i+1}</button>;
       })}</div></section>;
     })}
     <button type="button" onClick={()=>{if(monthCount<54)setMonthCount(monthCount+12);else {setFirstMonth(shiftMonth(firstMonth,12));setMonthCount(18);}}}>{labels.later}</button>
    </div>
    {maxNights&&<small role={!valid&&!empty?'status':undefined}>{labels.limit}: {maxNights}</small>}
    <footer><button type="button" data-testid="stay-calendar-reset" onClick={()=>setDraft(['',''])}>{labels.reset}</button><button type="button" data-testid="stay-calendar-save" disabled={!valid||disabled} onClick={()=>{onChange(...draft);close();}}>{labels.save} · {labels.nights}: {nights}</button></footer>
   </div>
  </dialog>,document.body)}
 </div>;
}
export function DemoStayCalendar({locale,checkIn,checkOut,onChange}:Pick<Props,'checkIn'|'checkOut'|'onChange'>&{locale:CalendarLocale}){
 return <section className="demoStayCalendar"><p>{calendarLabels[locale].demo}</p><StayDateRange locale={locale} checkIn={checkIn} checkOut={checkOut} onChange={onChange}/></section>;
}
