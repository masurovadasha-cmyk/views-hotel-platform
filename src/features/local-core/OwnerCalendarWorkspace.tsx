import {useEffect,useRef,useState} from 'react';
import {request} from './LocalCoreWorkspace';
import {useStaffLocale} from './StaffLocale';
import {localeTags} from './staff-locale';
type Command={action:'block';unitId:string;kind:'host_block'|'maintenance';start:string;end:string}|{action:'unblock';periodId:string};
type Calendar={units:{id:string;code:string;status:string}[];periods:{id:string;unitId:string;kind:string;start:string;end:string;expiresAt:string|null;canRemove:boolean}[];unitsTruncated:boolean;periodsTruncated:boolean;window:{start:string;end:string}};
const day=(offset:number)=>new Date(Date.now()+5*3600000+offset*86400000).toISOString().slice(0,10);
const errors:Record<string,string>={
 INVALID_CALENDAR_INPUT:'Проверьте даты и номер. Просмотр — до 62 дней, блокировка — до 366 дней.',
 CALENDAR_PERIOD_CONFLICT:'Этот интервал пересекается с бронью или другой блокировкой. Данные формы сохранены.',
 CALENDAR_UNIT_UNAVAILABLE:'Номер недоступен для ручной блокировки.',
 CALENDAR_BLOCK_NOT_FOUND:'Блокировка уже снята, изменена или создана другим инструментом. Обновите календарь.',
 CALENDAR_PROPERTY_UNSUPPORTED:'Календарь этого этапа доступен только для действующего собственного фонда в Узбекистане.',
 OWNER_CALENDAR_DISABLED:'Управление календарём пока не включено на этом стенде.',
 OWNER_INVENTORY_FORBIDDEN:'У вашей роли нет доступа к этому календарю.',STAFF_PERMISSION_DENIED:'У вашей роли нет доступа к этому календарю.',
 CSRF_REQUIRED:'Сессия изменилась. Перезагрузите страницу.',INVENTORY_NOT_FOUND:'Объект не найден или недоступен.'
};
const kinds:Record<string,string>={host_block:'Собственные нужды',maintenance:'Ремонт',reservation:'Бронирование',payment_hold:'Платёжный холд',external_calendar:'Внешний календарь'};
export function OwnerCalendarWorkspace({propertyId,staffCsrf,onClose}:{propertyId:string;staffCsrf:string;onClose:()=>void}){
 const {t,locale}=useStaffLocale(),[from,setFrom]=useState(()=>day(0)),[to,setTo]=useState(()=>day(30));
 const [data,setData]=useState<Calendar|null>(null),[unitId,setUnit]=useState(''),[kind,setKind]=useState<'host_block'|'maintenance'>('maintenance');
 const [start,setStart]=useState(()=>day(1)+'T14:00'),[end,setEnd]=useState(()=>day(2)+'T12:00');
 const [busy,setBusy]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState(''),[pending,setPending]=useState<{body:Command;key:string}|null>(null),[uncertain,setUncertain]=useState(false);
 const submitting=useRef(false),path='owner-inventory/'+propertyId+'/calendar';
 const url=()=>path+'?from='+encodeURIComponent(from)+'&to='+encodeURIComponent(to);
 const load=async()=>{const value=await request<Calendar>(url(),staffCsrf);setData(value);setUnit(old=>value.units.some(u=>u.id===old)?old:value.units.find(u=>u.status==='active')?.id||'');};
 useEffect(()=>{let alive=true;request<Calendar>(url(),staffCsrf).then(value=>{if(alive){setData(value);setUnit(value.units.find(u=>u.status==='active')?.id||'');}}).catch(e=>{if(alive)setError(errors[e.message]||'Не удалось загрузить календарь. Повторите загрузку.');}).finally(()=>{if(alive)setBusy(false);});return()=>{alive=false;};},[path,staffCsrf]);
 async function reload(){setBusy(true);setError('');try{await load();}catch(e){setError(errors[e instanceof Error?e.message:'']||'Не удалось загрузить календарь. Повторите загрузку.');}finally{setBusy(false);}}
 async function send(body:Command){
  if(submitting.current)return;const attempt=pending||{body,key:crypto.randomUUID()};setPending(attempt);submitting.current=true;setBusy(true);setError('');setNotice('');
  try{
   const result=await request<{propertyId:string;status:string;idempotentReplay?:boolean}>(path,staffCsrf,attempt.body,attempt.key);
   if(result.propertyId!==propertyId||result.status!==(attempt.body.action==='block'?'blocked':'unblocked'))throw Error('INVALID_RESPONSE');
   setPending(null);setUncertain(false);setNotice(result.idempotentReplay?'Команда уже выполнялась. Актуальное состояние — в календаре.':attempt.body.action==='block'?'Номер закрыт на выбранный интервал.':'Ручная блокировка снята.');
   try{await load();}catch{setData(null);setError('Изменение сохранено, но календарь не загрузился. Повторите загрузку.');}
  }catch(e){const code=e instanceof Error?e.message:'';
   if(errors[code]){setPending(null);setUncertain(false);setError(errors[code]);}
   else{setUncertain(true);setError('Ответ не получен. Повторите ту же отправку: дубликат не будет создан. До подтверждения не меняйте данные.');}
  }finally{submitting.current=false;setBusy(false);}
 }
 const format=(v:string)=>new Intl.DateTimeFormat(localeTags[locale],{timeZone:'Asia/Tashkent',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date(v));
 return <section className="localPanel ownerCalendar"><h2>{t('Календарь занятости')}</h2>
  <p className="localWarning">{t('Время объекта — Ташкент (UTC+5). Начало включено, конец не включён. Снимаются только ручные блокировки, созданные здесь; брони и платёжные холды не изменяются.')}</p>
  <button disabled={busy||uncertain} onClick={onClose}>{t('Вернуться к объектам')}</button>
  {error&&<p role="alert" className="localError">{t(error)}</p>}{notice&&<p role="status" className="localSuccess">{t(notice)}</p>}
  <form onSubmit={e=>{e.preventDefault();void reload();}}><fieldset disabled={busy||uncertain}>
   <label>{t('Показать с даты')}<input type="date" required value={from} onChange={e=>setFrom(e.target.value)}/></label>
   <label>{t('До даты, не включая')}<input type="date" required value={to} onChange={e=>setTo(e.target.value)}/></label>
   <button>{t('Обновить календарь')}</button>
  </fieldset></form>
  {data&&<><p>{t('Показан интервал: {start} — {end}',{start:format(data.window.start),end:format(data.window.end)})}</p>
   {(data.unitsTruncated||data.periodsTruncated)&&<p role="status" className="localWarning">{t('Показана только часть календаря: максимум 100 номеров и 1000 интервалов. Отсутствие записи не подтверждает доступность.')}</p>}
   {!data.periods.length&&<p>{t('Занятых интервалов в показанной части календаря нет. Доступность повторно проверяется при бронировании.')}</p>}
   <ul className="calendarPeriods">{data.periods.map(p=><li key={p.id}><strong>{data.units.find(u=>u.id===p.unitId)?.code||'—'}</strong> · {t(kinds[p.kind]||p.kind)} · {format(p.start)} — {format(p.end)}
    {p.kind==='payment_hold'&&p.expiresAt&&Date.parse(p.expiresAt)<=Date.now()&&<span> · {t('Ожидает освобождения холда')}</span>}
    {p.canRemove&&<button disabled={busy||uncertain} onClick={()=>{if(window.confirm(t('Снять эту ручную блокировку?')))void send({action:'unblock',periodId:p.id});}}>{t('Снять блокировку')}</button>}</li>)}</ul>
   <h3>{t('Закрыть номер на интервал')}</h3><form onSubmit={e=>{e.preventDefault();void send({action:'block',unitId,kind,start:start+'+05:00',end:end+'+05:00'});}}>
    <fieldset disabled={busy||uncertain}>
     <label>{t('Номер для блокировки')}<select required value={unitId} onChange={e=>setUnit(e.target.value)}>{data.units.filter(u=>u.status==='active').map(u=><option key={u.id} value={u.id}>{u.code}</option>)}</select></label>
     <label>{t('Причина закрытия')}<select value={kind} onChange={e=>setKind(e.target.value as typeof kind)}><option value="maintenance">{t('Ремонт')}</option><option value="host_block">{t('Собственные нужды')}</option></select></label>
     <label>{t('Начало блокировки')}<input type="datetime-local" required value={start} onChange={e=>setStart(e.target.value)}/></label>
     <label>{t('Конец блокировки')}<input type="datetime-local" required value={end} onChange={e=>setEnd(e.target.value)}/></label>
     <button className="primary" disabled={!unitId}>{t('Закрыть номер')}</button>
    </fieldset></form>
  </>}
  {uncertain&&pending&&<button className="primary" disabled={busy} onClick={()=>void send(pending.body)}>{t('Повторить ту же отправку')}</button>}
 </section>;
}
