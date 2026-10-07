import {TurnoverPanel,type TurnoverRow} from './TurnoverPanel';
import {StayActionConfirmation,type StayAction} from './StayActionConfirmation';
import {SyntheticDocumentPreview} from './SyntheticDocumentPreview';
import {useEffect,useRef,useState} from 'react';
import {request} from './LocalCoreWorkspace';
type Readiness={primaryGuest:string|null;unitActive:boolean;inventoryValid:boolean;paymentFree:boolean;timeAllowed:boolean;unitVacant:boolean;cleaningReady:boolean};
function blockers(r:Readiness|null|undefined){
 if(!r)return ['Проверки готовности не получены. Обновите сводку.'];
 return [r.cleaningReady===false&&'Не подтверждена уборка после предыдущего выезда.',!r.primaryGuest&&'Не указан основной гость.',!r.unitActive&&'Номер не назначен или недоступен.',!r.inventoryValid&&'Не подтверждён резерв номера на весь срок.',!r.paymentFree&&'Есть финансовая операция — требуется отдельная проверка.',!r.timeAllowed&&'Операция недоступна в текущий момент по датам брони.',!r.unitVacant&&'В номере ещё проживает другой гость.'].filter(Boolean) as string[];
}
type DocumentSummary={total:number;items:{previewId?:string|null;type:string;status:string;expired:boolean;uploadFinalized:boolean}[]};
function DocumentStatus({documents,onView}:{documents?:DocumentSummary|null;onView:(id:string)=>void}){
 const names:Record<string,string>={passport:'Паспорт',id_card:'ID-карта',birth_certificate:'Свидетельство о рождении',residence_permit:'Вид на жительство',travel_document:'Проездной документ',other:'Другой документ'};
 return <div aria-label="Документы основного гостя"><strong>Документы основного гостя</strong>
  {!documents?<p>Статусы документов не получены. Обновите сводку.</p>:documents.total===0?<p>Документы не добавлены.</p>:<>
   <ul>{documents.items.map((d,i)=><li key={i}><span>{names[d.type]||'Документ'}: {d.expired||d.status==='expired'?'Срок действия истёк':d.status==='rejected'?'Отклонён':!d.uploadFinalized?'Загрузка не завершена':d.status==='verified'?'Проверен в Core':d.status==='pending'?'Ожидает проверки':'Неизвестный статус'}</span>{d.previewId&&<button type="button" onClick={()=>onView(d.previewId!)}>Открыть тестовый файл</button>}</li>)}</ul>
   {documents.total>documents.items.length&&<p>Показаны {documents.items.length} из {documents.total} документов.</p>}
  </>}
  <p className="localHint">Показаны статусы записей тестовой среды. Просмотр файлов и проверка реальных документов не подключены. Это не подтверждение государственной регистрации.</p>
 </div>;
}
type Row=TurnoverRow&{readiness?:Readiness|null;documents?:DocumentSummary|null};
function GuestForm({row,csrf,done}:{row:Row;csrf:string;done:()=>Promise<void>}){
 const [firstName,setFirst]=useState(''),[lastName,setLast]=useState(''),[dateOfBirth,setBirth]=useState(''),[nationality,setCountry]=useState('UZ'),[saving,setSaving]=useState(false),[error,setError]=useState('');
 const key=useRef({body:'',key:''});
 async function save(){
  const guest={firstName:firstName.trim(),lastName:lastName.trim(),dateOfBirth,nationality,expectedVersion:row.version};
  const body=JSON.stringify(guest);if(key.current.body!==body)key.current={body,key:crypto.randomUUID()};
  setSaving(true);setError('');
  try{await request('guest',csrf,{reservationId:row.reservationId,guest},key.current.key);await done();}
  catch{setError('Сохранение не подтверждено. Можно повторить те же данные или закрыть форму и обновить сводку. При изменении брони другим сотрудником откройте форму заново.');}
  finally{setSaving(false);}
 }
 return <form aria-label="Данные тестового гостя" onSubmit={e=>{e.preventDefault();void save();}}>
  <p>Введите новые данные основного гостя для {row.confirmationCode}. Используйте только вымышленные данные. Документы этим действием не проверяются.</p>
  <label>Имя гостя<input required maxLength={100} value={firstName} disabled={saving} onChange={e=>setFirst(e.target.value)}/></label>
  <label>Фамилия гостя<input required maxLength={100} value={lastName} disabled={saving} onChange={e=>setLast(e.target.value)}/></label>
  <label>Дата рождения<input type="date" required min="1900-01-01" max={new Date().toISOString().slice(0,10)} value={dateOfBirth} disabled={saving} onChange={e=>setBirth(e.target.value)}/></label>
  <label>Код страны гражданства<input required pattern="[A-Z]{2}" maxLength={2} value={nationality} disabled={saving} onChange={e=>setCountry(e.target.value.toUpperCase())}/></label>
  <button disabled={saving}>Сохранить тестового гостя</button><button type="button" disabled={saving} onClick={()=>void done()}>Закрыть форму</button>
  {error&&<p role="alert">{error}</p>}
 </form>;
}
type Group={total:number;truncated:boolean;items:Row[]};
type Board={property:{name:Record<string,string>;timezone:string};day:string;databaseTime:string;arrivals:Group;departures:Group;staying:Group;cleaning:Group};
export function ReceptionWorkspace({staffCsrf}:{staffCsrf:string}){
 const [data,setData]=useState<Board|null>(null),[day,setDay]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [preview,setPreview]=useState<{reservationId:string;documentId:string}|null>(null);
 const [editing,setEditing]=useState<Row|null>(null);
 const heading=useRef<HTMLHeadingElement>(null);
 const actionTrigger=useRef<HTMLButtonElement|null>(null);
 const sequence=useRef(0),keys=useRef(new Map<string,string>());
 const [pending,setPending]=useState<{row:Row;action:StayAction}|null>(null),[notice,setNotice]=useState('');
 async function apply(){
  if(!pending)return;const {row,action}=pending;const binding=row.reservationId+action;
  let key=keys.current.get(binding);if(!key){key=crypto.randomUUID();keys.current.set(binding,key);}
  setBusy(true);setNotice('');setError('');
  try{await request(action,staffCsrf,{reservationId:row.reservationId},key);setNotice(action==='cleaning-complete'?'Готовность тестового номера после уборки подтверждена.':action==='check-in'?'Тестовое заселение оформлено.':'Тестовый выезд оформлен. Оставшийся интервал брони освобождён; готовность номера после уборки проверяется отдельно.');setPending(null);await load(day);}
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
  <h2 ref={heading} tabIndex={-1}>Ресепшен: заезды и выезды</h2>
  <p className="localHint">Ожидаемые заезды и выезды по плану на выбранную дату. Проживающие — по текущему статусу брони, а не исторический отчёт. Временные резервы и отмены сюда не входят.</p>
  <form className="receptionDate" onSubmit={e=>{e.preventDefault();void load(day);}}>
   <label>Дата ресепшена<input aria-label="Дата ресепшена" type="date" required value={day} disabled={busy||!!editing} onChange={e=>setDay(e.target.value)}/></label>
   <button disabled={busy||!!editing}>Показать сводку</button>
  </form>
  {preview&&<SyntheticDocumentPreview key={preview.documentId} {...preview} csrf={staffCsrf} onClose={()=>{setPreview(null);void load(day);}}/>}
  {editing&&<GuestForm row={editing} csrf={staffCsrf} done={async()=>{setEditing(null);await load(day);}}/>}
  {notice&&<p role="status" className="localSuccess">{notice}</p>}
  {pending&&<StayActionConfirmation {...pending} trigger={actionTrigger.current} busy={busy} onConfirm={()=>void apply()} onCancel={()=>setPending(null)} fallbackFocus={()=>heading.current?.focus()}/>}
  {busy&&<p role="status">Загрузка сводки…</p>}{error&&<p role="alert" className="localError">{error}</p>}
  {data&&<>
   <p>Дата сводки: {data.day} · {data.property.timezone}. Обновлено: {format(data.databaseTime)}.</p>
   <div className="receptionGroups">{([['arrivals','Ожидаемые заезды'],['departures','Выезды по плану'],['staying','Сейчас проживают']] as const).map(([key,label])=>{
    const group=data[key];return <section className="localPanel" aria-label={label} key={key}>
     <h3>{label}: {group.total}</h3>
     {group.total===0?<p>Нет записей.</p>:<ul>{group.items.map(r=><li key={r.reservationId} data-stay-id={r.reservationId}>
      <strong>{r.confirmationCode}</strong><div>{r.unitCode||'Номер не назначен'} · {r.status==='checked_out'?'Выезд оформлен':r.status==='confirmed'?'Подтверждена':'Заселён'}</div>
      <small>{format(r.checkInAt)} — {format(r.checkOutAt)}</small>
      {r.stayPilot&&r.status!=='checked_out'&&<div className="stayReadiness"><p>Основной гость: {r.readiness?.primaryGuest||'не указан'}</p><p className="localHint">Тестовая карточка. Проверка документов и государственная регистрация не выполнялись.</p>
       {blockers(r.readiness).length?<ul aria-label="Причины блокировки">{blockers(r.readiness).map(reason=><li key={reason}>{reason}</li>)}</ul>:<p>Проверки тестовой брони пройдены. При подтверждении сервер проверит её снова.</p>}
       <DocumentStatus documents={r.documents} onView={documentId=>setPreview({reservationId:r.reservationId,documentId})}/>
       {!!r.documents?.total&&<p>Изменение данных гостя заблокировано: есть связанные документы.</p>}
       {r.status==='confirmed'&&<button disabled={busy||!!editing||!!pending||!!r.documents?.total} onClick={()=>setEditing(r)}>Заполнить данные гостя (тест)</button>}
       <button disabled={busy||!!editing||!!pending||blockers(r.readiness).length>0} onClick={event=>{actionTrigger.current=event.currentTarget;setNotice('');setPending({row:r,action:r.status==='confirmed'?'check-in':'check-out'});}}>{r.status==='confirmed'?'Заселить (тест)':'Оформить выезд (тест)'}</button></div>}
     </li>)}</ul>}
     {group.truncated&&<p>Показаны первые 100 из {group.total} записей.</p>}
    </section>;
   })}</div>
   <TurnoverPanel group={data.cleaning} disabled={busy||!!editing||!!pending} format={format} onConfirm={(row,trigger)=>{actionTrigger.current=trigger;setNotice('');setPending({row,action:'cleaning-complete'});}}/>
   <p className="localHint">Заселение и выезд доступны только для специально подготовленных бесплатных тестовых броней. Реальные гости, документы и расчёты не подключены.</p>
  </>}
 </section>;
}
