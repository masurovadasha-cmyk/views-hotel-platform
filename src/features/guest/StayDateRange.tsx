import {useMemo,useState} from "react";
import {nextStaySelection,stayNights} from "./stayDateRangeModel";
type Props={checkIn:string;checkOut:string;onChange:(start:string,end:string)=>void};
const iso=(d:Date)=>d.toISOString().slice(0,10);
const date=(s:string)=>new Date(s+"T12:00:00Z");
const monthLabel=(d:Date)=>new Intl.DateTimeFormat("ru-RU",{month:"long",year:"numeric",timeZone:"UTC"}).format(d);

export function StayDateRange({checkIn,checkOut,onChange}:Props){
 const [open,setOpen]=useState(false);
 const [draftStart,setDraftStart]=useState(checkIn);
 const [draftEnd,setDraftEnd]=useState(checkOut);
 const today=iso(new Date());
 const months=useMemo(()=>{
  const base=date(today);base.setUTCDate(1);
  return Array.from({length:18},(_,i)=>new Date(Date.UTC(base.getUTCFullYear(),base.getUTCMonth()+i,1,12)));
 },[today]);
 function show(){setDraftStart(checkIn);setDraftEnd(checkOut);setOpen(true)}
 function select(value:string){
  const [start,end]=nextStaySelection(draftStart,draftEnd,value,today);
  setDraftStart(start);setDraftEnd(end);
 }
 return <div className="stayDateRange">
  <button type="button" onClick={show} aria-label="Выбрать даты заезда и выезда">{checkIn||"Заезд"} — {checkOut||"Выезд"}{checkIn&&checkOut?" · "+stayNights(checkIn,checkOut)+" ночей":""}</button>
  {open&&<div role="dialog" aria-modal="true" aria-label="Календарь бронирования" className="stayDateDialog">
   <div className="stayDateDialogCard">
    <header><strong>Выберите даты проживания</strong><button type="button" onClick={()=>setOpen(false)} aria-label="Закрыть календарь">✕</button></header>
    <p>{draftStart||"Заезд"} — {draftEnd||"Выезд"}{draftStart&&draftEnd?" · "+stayNights(draftStart,draftEnd)+" ночей":""}</p>
    <div className="stayDateMonths">
     {months.map(m=>{
      const year=m.getUTCFullYear(),month=m.getUTCMonth(),first=m.getUTCDay(),offset=(first+6)%7;
      const count=new Date(Date.UTC(year,month+1,0)).getUTCDate();
      return <section key={year+"-"+month}><h3>{monthLabel(m)}</h3>
       <div className="stayDateGrid">{["Пн","Вт","Ср","Чт","Пт","Сб","Вс"].map(w=><small key={w}>{w}</small>)}
        {Array.from({length:offset},(_,i)=><span key={"pad"+i}/>)}
        {Array.from({length:count},(_,i)=>{
         const value=iso(new Date(Date.UTC(year,month,i+1,12)));
         const edge=value===draftStart||value===draftEnd;
         return <button type="button" key={value} disabled={value<today} aria-pressed={edge}
          className={(edge?"edge ":"")+(draftStart&&draftEnd&&value>draftStart&&value<draftEnd?"inside":"")}
          onClick={()=>select(value)}>{i+1}</button>;
        })}
       </div>
      </section>;
     })}
    </div>
    <footer><button type="button" onClick={()=>{setDraftStart("");setDraftEnd("")}}>Сбросить</button>
     <button type="button" disabled={!draftStart||!draftEnd} onClick={()=>{onChange(draftStart,draftEnd);setOpen(false)}}>Сохранить · {draftStart&&draftEnd?stayNights(draftStart,draftEnd):0} ночей</button></footer>
   </div>
  </div>}
 </div>;
}
