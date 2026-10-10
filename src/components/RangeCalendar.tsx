import {useState} from "react";
import "./range-calendar.css";

type Props={start:string;end:string;onApply:(start:string,end:string)=>void;onClose:()=>void};
const dateKey=(d:Date)=>[d.getUTCFullYear(),String(d.getUTCMonth()+1).padStart(2,"0"),String(d.getUTCDate()).padStart(2,"0")].join("-");
const utcDate=(key:string)=>new Date(key+"T00:00:00Z");
export function nightsBetween(start:string,end:string){
 if(!start||!end)return 0;
 const delta=(utcDate(end).getTime()-utcDate(start).getTime())/86400000;
 return Number.isFinite(delta)&&delta>0?Math.floor(delta):0;
}
export function RangeCalendar({start,end,onApply,onClose}:Props){
 const [draftStart,setDraftStart]=useState(start);
 const [draftEnd,setDraftEnd]=useState(end);
 const today=dateKey(new Date());
 const first=new Date(Date.UTC(new Date().getFullYear(),new Date().getMonth(),1));
 const months=Array.from({length:12},(_,i)=>new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+i,1)));
 const choose=(day:string)=>{
  if(!draftStart||draftEnd||day<=draftStart){setDraftStart(day);setDraftEnd("");}
  else setDraftEnd(day);
 };
 return <div className="viewsRangeBackdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}>
  <section className="viewsRangeDialog" role="dialog" aria-modal="true" aria-label="Выбор дат заезда и выезда">
   <header><div><strong>Даты поездки</strong><small>{nightsBetween(draftStart,draftEnd)?nightsBetween(draftStart,draftEnd)+" ночей":"Выберите заезд и выезд"}</small></div><button type="button" onClick={onClose} aria-label="Закрыть календарь">×</button></header>
   <div className="viewsRangeMonths">
    {months.map(month=>{
     const year=month.getUTCFullYear(),m=month.getUTCMonth();
     const count=new Date(Date.UTC(year,m+1,0)).getUTCDate();
     const offset=(month.getUTCDay()+6)%7;
     return <div className="viewsRangeMonth" key={year+"-"+m}>
      <h3>{new Intl.DateTimeFormat("ru-RU",{month:"long",year:"numeric",timeZone:"UTC"}).format(month)}</h3>
      <div className="viewsRangeDays">{["Пн","Вт","Ср","Чт","Пт","Сб","Вс"].map(x=><small key={x}>{x}</small>)}
      {Array.from({length:offset},(_,i)=><span key={"blank"+i}/>)}
      {Array.from({length:count},(_,i)=>{
       const day=dateKey(new Date(Date.UTC(year,m,i+1)));
       const selected=day===draftStart||day===draftEnd;
       const between=!!draftStart&&!!draftEnd&&day>draftStart&&day<draftEnd;
       return <button type="button" key={day} disabled={day<today} aria-pressed={selected} aria-label={day}
        className={(selected?"endpoint ":"")+(between?"inRange":"")} onClick={()=>choose(day)}>{i+1}</button>
      })}</div>
     </div>
    })}
   </div>
   <footer><button type="button" onClick={()=>{setDraftStart("");setDraftEnd("")}}>Сбросить даты</button>
   <button type="button" className="viewsRangeSave" disabled={!nightsBetween(draftStart,draftEnd)} onClick={()=>{onApply(draftStart,draftEnd);onClose()}}>Сохранить · {nightsBetween(draftStart,draftEnd)} ночей</button></footer>
  </section>
 </div>;
}
