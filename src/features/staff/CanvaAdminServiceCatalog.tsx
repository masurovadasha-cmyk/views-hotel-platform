import {useState} from "react";
import {canvaServices} from "../../data/canvaServices";
import {RangeCalendar} from "../../components/RangeCalendar";

export function CanvaAdminServiceCatalog(){
 const [selected,setSelected]=useState("cleaning");
 const [start,setStart]=useState("");
 const [end,setEnd]=useState("");
 const [calendarOpen,setCalendarOpen]=useState(false);
 const service=canvaServices.find(s=>s.id===selected)??canvaServices[0];
 return <section className="canvaAdminCatalog" aria-label="Canva v0.4 service administration preview">
  <header><small>VIEWS ADMIN · CANVA v0.4</small><h2>Каталог услуг</h2><p>Предпросмотр настроек. Изменения не сохраняются на сервере.</p></header>
  <label>Услуга <select value={selected} onChange={e=>setSelected(e.target.value)}>{canvaServices.map(s=><option value={s.id} key={s.id}>{s.label}</option>)}</select></label>
  <div className="canvaAdminDetails">
   <article><small>Название RU</small><b>{service.label}</b></article>
   <article><small>Код</small><b>{service.id.toUpperCase()}</b></article>
   <article><small>Цена</small><b>{service.demoPriceUzs?service.demoPriceUzs.toLocaleString("ru-RU")+" UZS":"По запросу"}</b></article>
   <article><small>Исполнение</small><b>{service.requiresPartner?"Партнёр":"VIEWS / назначенный исполнитель"}</b></article>
  </div>
  <button type="button" onClick={()=>setCalendarOpen(true)}>Календарь доступности · {start&&end?start+" — "+end:"выбрать период"}</button>
  {calendarOpen&&<RangeCalendar start={start} end={end} onApply={(a,b)=>{setStart(a);setEnd(b)}} onClose={()=>setCalendarOpen(false)}/>}
  <p className="canvaAdminNotice">Демо: RU / UZ / EN, правила цен, SLA, права партнёров и журнал изменений требуют серверной реализации и проверки.</p>
 </section>;
}
