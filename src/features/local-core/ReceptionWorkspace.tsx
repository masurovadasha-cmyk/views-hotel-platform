import {useEffect,useRef,useState} from 'react';
import {request} from './LocalCoreWorkspace';
type Readiness={primaryGuest:string|null;unitActive:boolean;inventoryValid:boolean;paymentFree:boolean;timeAllowed:boolean;unitVacant:boolean};
function blockers(r:Readiness|null|undefined){
 if(!r)return ['Проверки готовности не получены. Обновите сводку.'];
 return [!r.primaryGuest&&'Не указан основной гость.',!r.unitActive&&'Номер не назначен или недоступен.',!r.inventoryValid&&'Не подтверждён резерв номера на весь срок.',!r.paymentFree&&'Есть финансовая операция — требуется отдельная проверка.',!r.timeAllowed&&'Операция недоступна в текущий момент по датам брони.',!r.unitVacant&&'В номере ещё проживает другой гость.'].filter(Boolean) as string[];
}
type Row={reservationId:string;confirmationCode:string;unitCode:string|null;status:string;stayPilot?:boolean;readiness?:Readiness|null;checkInAt:string;checkOutAt:string};
type Group={total:number;truncated:boolean;items:Row[]};
type Board={property:{name:Record<string,string>;timezone:string};day:string;databaseTime:string;arrivals:Group;departures:Group;staying:Group};
export function ReceptionWorkspace({staffCsrf}:{staffCsrf:string}){
 const [data,setData]=useState<Board|null>(null),[day,setDay]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const sequence=useRef(0),keys=useRef(new Map<string,string>());
 const [pending,setPending]=useState<{row:Row;action:'check-in'|'check-out'}|null>(null),[notice,setNotice]=useState('');
 async function apply(){
  if(!pending)return;const {row,action}=pending;const binding=row.reservationId+action;
  let key=keys.current.get(binding);if(!key){key=crypto.randomUUID();keys.current.set(binding,key);}
  setBusy(true);setNotice('');setError('');
  try{await request(action,staffCsrf,{reservationId:row.reservationId},key);setNotice(action==='check-in'?'Тестовое заселение оформлено.':'Тестовый выезд оформлен. Оставшийся интервал брони освобождён; готовность номера после уборки проверяется отдельно.');setPending(null);await load(day);}
  catch{setPending(null);await load(day);setError('Операция не подтверждена. Проверьте обновлённый статус перед повтором. Заселение доступно только в срок брони, с тестовым гостем и без оплаты.');}
  finally{setBusy(false);}
 }
 async function load(selected:string){
  const id=++sequence.current;setBusy(true);setError('');setData(null);
  try{const result=await request<Board>('reception?day='+encodeURIComponent(selected||'today'),staffCsrf);
   if(id===sequence.current){setData(result);setDay(result.day);}
  }catch{if(id===sequence.current)setError('Не удалось загрузить сводку ресепшена. Проверьте дату и соединение, затем повторите запрос.');}
  finally{if(id===sequence.current)setBusy(false);}
 }
 useEffect(()=>{void load('today');return()=>{sequence.current++;};},[staffCsrf]);
 const format=(value:string)=>new Intl.DateTimeFormat('ru-RU',{timeZone:data!.property.timezone,day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date(value));
 return <section className="localWorkspace" aria-label="Ресепшен">
  <h2>Ресепшен: заезды и выезды</h2>
  <p className="localHint">Ожидаемые заезды и выезды по плану на выбранную дату. Проживающие — по текущему статусу брони, а не исторический отчёт. Временные резервы и отмены сюда не входят.</p>
  <form className="receptionDate" onSubmit={e=>{e.preventDefault();void load(day);}}>
   <label>Дата ресепшена<input aria-label="Дата ресепшена" type="date" required value={day} disabled={busy} onChange={e=>setDay(e.target.value)}/></label>
   <button disabled={busy}>Показать сводку</button>
  </form>
  {notice&&<p role="status" className="localSuccess">{notice}</p>}
  {pending&&<div className="localWarning"><p>{pending.action==='check-in'?'Оформить тестовое заселение':'Оформить тестовый выезд'}: {pending.row.confirmationCode}? Реальная оплата и регистрация гостя в государственных системах не выполняются.</p>
   <button disabled={busy} onClick={()=>void apply()}>Подтвердить действие</button> <button disabled={busy} onClick={()=>setPending(null)}>Отмена</button></div>}
  {busy&&<p role="status">Загрузка сводки…</p>}{error&&<p role="alert" className="localError">{error}</p>}
  {data&&<>
   <p>Дата сводки: {data.day} · {data.property.timezone}. Обновлено: {format(data.databaseTime)}.</p>
   <div className="receptionGroups">{([['arrivals','Ожидаемые заезды'],['departures','Выезды по плану'],['staying','Сейчас проживают']] as const).map(([key,label])=>{
    const group=data[key];return <section className="localPanel" aria-label={label} key={key}>
     <h3>{label}: {group.total}</h3>
     {group.total===0?<p>Нет записей.</p>:<ul>{group.items.map(r=><li key={r.reservationId} data-stay-id={r.reservationId}>
      <strong>{r.confirmationCode}</strong><div>{r.unitCode||'Номер не назначен'} · {r.status==='confirmed'?'Подтверждена':'Заселён'}</div>
      <small>{format(r.checkInAt)} — {format(r.checkOutAt)}</small>
      {r.stayPilot&&<div className="stayReadiness"><p>Основной гость: {r.readiness?.primaryGuest||'не указан'}</p><p className="localHint">Тестовая карточка. Проверка документов и государственная регистрация не выполнялись.</p>
       {blockers(r.readiness).length?<ul aria-label="Причины блокировки">{blockers(r.readiness).map(reason=><li key={reason}>{reason}</li>)}</ul>:<p>Проверки тестовой брони пройдены. При подтверждении сервер проверит её снова.</p>}
       <button disabled={busy||blockers(r.readiness).length>0} onClick={()=>{setNotice('');setPending({row:r,action:r.status==='confirmed'?'check-in':'check-out'});}}>{r.status==='confirmed'?'Заселить (тест)':'Оформить выезд (тест)'}</button></div>}
     </li>)}</ul>}
     {group.truncated&&<p>Показаны первые 100 из {group.total} записей.</p>}
    </section>;
   })}</div>
   <p className="localHint">Заселение и выезд доступны только для специально подготовленных бесплатных тестовых броней. Реальные гости, документы и расчёты не подключены.</p>
  </>}
 </section>;
}
