import {useMemo,useState} from "react";
import {canvaServices} from "../../data/canvaServices";
import {RangeCalendar} from "../../components/RangeCalendar";
type Rule={priceUzs:number;durationMinutes:number;bufferMinutes:number;slaMinutes:number;fulfillment:"staff"|"partner";enabled:boolean};
const defaults:Rule={priceUzs:120000,durationMinutes:40,bufferMinutes:10,slaMinutes:60,fulfillment:"staff",enabled:true};
const valid=(n:number,min:number,max:number)=>Number.isSafeInteger(n)&&n>=min&&n<=max;
export function CanvaAdminServiceCatalog(){
 const [selected,setSelected]=useState("cleaning");
 const [start,setStart]=useState("");
 const [end,setEnd]=useState("");
 const [calendarOpen,setCalendarOpen]=useState(false);
 const [rules,setRules]=useState<Record<string,Rule>>({});
 const [saved,setSaved]=useState("");
 const service=canvaServices.find(s=>s.id===selected)??canvaServices[0];
 const current=rules[selected]??{...defaults,priceUzs:service.demoPriceUzs??0,fulfillment:service.requiresPartner?"partner":"staff" as "staff"|"partner"};
 const update=(field:keyof Rule,value:number|string|boolean)=>{setSaved("");setRules(prev=>({...prev,[selected]:{...current,[field]:value}}))};
 const errors=useMemo(()=>[
  !valid(current.priceUzs,0,1000000000)?"Некорректная цена":null,
  !valid(current.durationMinutes,1,1440)?"Некорректная длительность":null,
  !valid(current.bufferMinutes,0,240)?"Некорректный буфер":null,
  !valid(current.slaMinutes,1,10080)?"Некорректный SLA":null
 ].filter(Boolean),[current]);
 return <section className="canvaAdminCatalog" aria-label="Canva v0.4 service administration preview">
  <header><small>VIEWS ADMIN · CANVA v0.4</small><h2>Настройки услуг</h2><p>Локальный предпросмотр: изменения не публикуются и не отправляются в Core.</p></header>
  <label>Услуга <select value={selected} onChange={e=>{setSelected(e.target.value);setSaved("")}}>{canvaServices.map(s=><option value={s.id} key={s.id}>{s.label}</option>)}</select></label>
  <div className="canvaAdminDetails">
   <label>Название RU<input value={service.label} readOnly/></label>
   <label>Код<input value={service.id.toUpperCase()} readOnly/></label>
   <label>Цена UZS<input type="number" min={0} value={current.priceUzs} onChange={e=>update("priceUzs",Number(e.target.value))}/></label>
   <label>Длительность, мин<input type="number" min={1} value={current.durationMinutes} onChange={e=>update("durationMinutes",Number(e.target.value))}/></label>
   <label>Буфер, мин<input type="number" min={0} value={current.bufferMinutes} onChange={e=>update("bufferMinutes",Number(e.target.value))}/></label>
   <label>SLA, мин<input type="number" min={1} value={current.slaMinutes} onChange={e=>update("slaMinutes",Number(e.target.value))}/></label>
   <label>Исполнение<select value={current.fulfillment} onChange={e=>update("fulfillment",e.target.value)}><option value="staff">Сотрудник VIEWS</option><option value="partner">Партнёр</option></select></label>
   <label><input type="checkbox" checked={current.enabled} onChange={e=>update("enabled",e.target.checked)}/> Доступна для заказа</label>
  </div>
  <button type="button" onClick={()=>setCalendarOpen(true)}>Календарь доступности · {start&&end?start+" — "+end:"выбрать период"}</button>
  {calendarOpen&&<RangeCalendar start={start} end={end} onApply={(a,b)=>{setStart(a);setEnd(b)}} onClose={()=>setCalendarOpen(false)}/>}
  {errors.length>0&&<p role="alert">{errors.join(" · ")}</p>}
  <div className="canvaAdminActions"><button type="button" disabled={errors.length>0} onClick={()=>setSaved("Предпросмотр проверен. Для публикации необходим серверный API и журнал аудита.")}>Проверить настройки</button>{saved&&<p role="status">{saved}</p>}</div>
  <p className="canvaAdminNotice">Демо · нет серверного сохранения, публикации тарифов или реальных изменений SLA.</p>
 </section>;
}
