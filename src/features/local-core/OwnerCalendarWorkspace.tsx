import {StayDateRange} from "../calendar/StayDateRange";
import {stayNights} from "../../domain/bookingQuote";
import {useEffect,useRef,useState} from 'react';
import {parseRecoveryScope,recoveryScopeKey,type RecoveryScope} from './booking-recovery';
import {claimCalendarAttempt,clearCalendarAttempt,loadCalendarAttempt,parseCalendarBody,parseCalendarReceipt,type CalendarAttempt,type CalendarCommand as Command} from './owner-calendar-recovery';
import {request} from './LocalCoreWorkspace';
import {useStaffLocale} from './StaffLocale';
import {localeTags} from './staff-locale';
type Calendar={recoveryScope:RecoveryScope;units:{id:string;code:string;status:string}[];periods:{id:string;unitId:string;kind:string;start:string;end:string;expiresAt:string|null;canRemove:boolean}[];unitsTruncated:boolean;periodsTruncated:boolean;window:{start:string;end:string}};
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
type Props={propertyId:string;staffCsrf:string;onClose:()=>void};
export function OwnerCalendarWorkspace(props:Props){return <CalendarWorkspace key={props.propertyId+':'+props.staffCsrf} {...props}/>;}
function CalendarWorkspace({propertyId,staffCsrf,onClose}:Props){
 const {t,locale}=useStaffLocale(),[from,setFrom]=useState(()=>day(0)),[to,setTo]=useState(()=>day(30));
 const [data,setData]=useState<Calendar|null>(null),[unitId,setUnit]=useState(''),[kind,setKind]=useState<'host_block'|'maintenance'>('maintenance');
 const [start,setStart]=useState(()=>day(1)+'T14:00'),[end,setEnd]=useState(()=>day(2)+'T12:00');
 const [busy,setBusy]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState(''),[pending,setPending]=useState<CalendarAttempt|null>(null),[storageError,setStorageError]=useState(false),[scope,setScope]=useState<RecoveryScope|null>(null);
 const submitting=useRef(false),alive=useRef(true),identity=useRef(''),path='owner-inventory/'+propertyId+'/calendar';
 const uncertain=!!pending||storageError||!scope;
 const url=()=>path+'?from='+encodeURIComponent(from)+'&to='+encodeURIComponent(to);
 const load=async()=>{
  const value=await request<Calendar>(url(),staffCsrf);if(!alive.current)return;
  try{
   const next=parseRecoveryScope(value.recoveryScope);if(next.propertyId!==propertyId)throw Error('INVALID_SCOPE');
   const key=recoveryScopeKey(next);if(identity.current!==key){identity.current=key;setPending(null);setNotice('');setData(null);}
   const attempt=await loadCalendarAttempt(next);if(!alive.current)return;
   setScope(next);setPending(attempt);setStorageError(false);setData(value);setUnit(old=>value.units.some(u=>u.id===old)?old:value.units.find(u=>u.status==='active')?.id||'');
  }catch{if(alive.current){setStorageError(true);setData(null);setScope(null);}}
 };
 useEffect(()=>{alive.current=true;void load().catch(()=>{if(alive.current)setError('Не удалось загрузить календарь. Повторите загрузку.');}).finally(()=>{if(alive.current)setBusy(false);});return()=>{alive.current=false;};},[]);
 async function reload(){if(submitting.current)return;setBusy(true);setError('');try{await load();}catch{setError('Не удалось загрузить календарь. Повторите загрузку.');}finally{if(alive.current)setBusy(false);}}
 async function send(body:Command){
  if(submitting.current||storageError||!scope)return;
  if(!pending){try{body=parseCalendarBody(body);}catch{setError(errors.INVALID_CALENDAR_INPUT);return;}}
  const recovering=!!pending,desired=pending||{version:1 as const,scope,body,key:crypto.randomUUID()};
  submitting.current=true;setBusy(true);setError('');setNotice('');
  let attempt:CalendarAttempt;
  try{attempt=await claimCalendarAttempt(desired);if(!alive.current)return;setPending(attempt);}
  catch{setStorageError(true);submitting.current=false;setBusy(false);return;}
  if(attempt.key!==desired.key){submitting.current=false;setBusy(false);return;}
  try{
   const result=parseCalendarReceipt(await request<unknown>(path,staffCsrf,{...attempt.body,...recovering?{recoveryOnly:true}:{}},attempt.key),attempt);
   if(!alive.current)return;
   await clearCalendarAttempt(attempt);if(!alive.current)return;setPending(null);
   setNotice(result.status==='not_applied'?'Команда не была применена. Можно выбрать новое действие.':result.currentState==='changed'?'Интервал изменён другим процессом. Проверьте календарь.':result.currentState==='absent'?'Ручной интервал отсутствует. Доступность проверяется отдельно.':'Ручная блокировка подтверждена. Актуальное состояние — в календаре.');
   try{await load();}catch{if(alive.current){setData(null);setError('Изменение сохранено, но календарь не загрузился. Повторите загрузку.');}}
  }catch(e){if(alive.current){const code=e instanceof Error?e.message:'';setError(errors[code]||'Ответ не получен. Повторите ту же отправку: дубликат не будет создан. До подтверждения не меняйте данные.');}}
  finally{submitting.current=false;if(alive.current)setBusy(false);}
 }
 const format=(v:string)=>new Intl.DateTimeFormat(localeTags[locale],{timeZone:'Asia/Tashkent',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date(v));
 return <section className="localPanel ownerCalendar" data-testid="owner-calendar"><h2>{t('Календарь занятости')}</h2>
  <p className="localWarning">{t('Время объекта — Ташкент (UTC+5). Начало включено, конец не включён. Снимаются только ручные блокировки, созданные здесь; брони и платёжные холды не изменяются.')}</p>
  <button disabled={busy||uncertain} onClick={onClose}>{t('Вернуться к объектам')}</button>
  {storageError&&<p role="alert" data-testid="owner-calendar-storage-error">{t('Хранилище восстановления недоступно. Изменения заблокированы; сохранённые попытки не удалены.')}</p>}
  {pending&&<div data-testid="owner-calendar-recovery"><p>{t('Проверьте результат предыдущего действия перед изменением календаря.')}</p><p>{pending.body.action==='block'?`${t(kinds[pending.body.kind])} · ${format(pending.body.start)} — ${format(pending.body.end)}`:t('Снять блокировку')}</p></div>}
  {error&&<p role="alert" className="localError">{t(error)}</p>}{notice&&<p data-testid="owner-calendar-receipt" role="status" className="localSuccess">{t(notice)}</p>}
  <form onSubmit={e=>{e.preventDefault();void reload();}}><fieldset disabled={busy||uncertain}>
   <StayDateRange locale={locale} allowPast maxNights={62} disabled={busy||uncertain} checkIn={from} checkOut={to} onChange={(a,b)=>{setFrom(a);setTo(b);}}/>
   <button disabled={!stayNights(from,to)}>{t('Обновить календарь')}</button>
  </fieldset></form>
  <button data-testid="owner-calendar-refresh" disabled={busy} onClick={()=>void reload()}>{t('Повторить загрузку')}</button>
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
  {pending&&<button data-testid="owner-calendar-retry" className="primary" disabled={busy||storageError||!scope} onClick={()=>void send(pending.body)}>{t('Повторить ту же отправку')}</button>}
 </section>;
}
