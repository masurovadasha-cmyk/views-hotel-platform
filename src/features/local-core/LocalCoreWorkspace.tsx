import {useEffect,useRef,useState} from "react";
import "./local-core.css";

type Unit={unitId:string;code:string;unitTypeName:Record<string,string>;maxGuests:number;ratePlanId:string;rateName:Record<string,string>;currency:string;baseNightlyMinor:string};
type Reservation={reservationId:string;confirmationCode:string;unitCode:string;status:string;activeHold:boolean;checkInAt:string;checkOutAt:string;holdExpiresAt:string|null;totalMinor:string;currency:string};
type Workspace={property:{id:string;name:Record<string,string>;timezone:string};units:Unit[];reservations:Reservation[];reservationsTruncated:boolean;databaseTime:string;syntheticData:true;realPayments:false};
type Quote={quoteId:string;currency:string;nights:number;totalMinor:string;expiresAt:string;lines:Array<{code:string;label:Record<string,string>;amountMinor:string}>};
type Hold={reservationId:string;confirmationCode:string;holdExpiresAt:string;status:string;idempotentReplay:boolean};
let boot:Promise<{csrf:string}>|null=null;
async function request<T>(route:string,csrf?:string,body?:unknown,key?:string):Promise<T>{
  const headers:Record<string,string>={"X-Views-Local-Workspace":"1"};
  if(csrf)headers["X-CSRF-Token"]=csrf;
  if(body!==undefined)headers["Content-Type"]="application/json";
  if(key)headers["Idempotency-Key"]=key;
  const response=await fetch("/local-api/"+route,{method:body===undefined?"GET":"POST",credentials:"same-origin",headers,
    body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
  const value=await response.json();if(!response.ok)throw new Error(value.error||"CORE_UNAVAILABLE");return value as T;
}
function session(){if(!boot)boot=request<{csrf:string}>("session").catch(e=>{boot=null;throw e;});return boot;}
const name=(value:Record<string,string>)=>value.ru||value.en||Object.values(value)[0]||"—";
export function uzs(minor:string){
  if(!/^\d+$/.test(minor))return "—";
  const value=BigInt(minor),whole=(value/100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g," "),fraction=value%100n;
  return whole+(fraction?","+fraction.toString().padStart(2,"0"):"")+" UZS";
}
function day(offset:number){return new Date(Date.now()+5*3600000+offset*86400000).toISOString().slice(0,10);}
const dateTime=(value:string)=>new Intl.DateTimeFormat("ru-RU",{timeZone:"Asia/Tashkent",day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}).format(new Date(value));
const errors:Record<string,string>={
  CORE_UNAVAILABLE:"Core недоступен. Данные не заменены демо-значениями. Проверьте сервер и обновите список.",
  LOCAL_WORKSPACE_NOT_PREPARED:"Локальная рабочая область ещё не подготовлена.",
  LOCAL_SESSION_REQUIRED:"Тестовая сессия истекла. Перезагрузите страницу.",CSRF_REQUIRED:"Сессия изменилась. Перезагрузите страницу.",
  UNIT_NOT_AVAILABLE:"Апартамент уже занят на эти даты. Выберите другие даты или снимите тестовый резерв.",
  BOOKING_CONFLICT:"На эти даты уже существует резерв. Обновите список.",
  BOOKING_PERIOD_CONFLICT:"На эти даты уже существует резерв. Обновите список.",
  QUOTE_EXPIRED:"Расчёт устарел. Рассчитайте стоимость заново.",INVALID_DATES:"Проверьте даты: от 1 до 30 ночей, не в прошлом.",
  WORKSPACE_BUSY:"Сервер занят. Повторите запрос с тем же ключом.",INVALID_GUEST_COUNT:"Количество гостей превышает вместимость.",
  PROPERTY_FORBIDDEN:"У тестового сотрудника нет доступа к этому объекту.",
  IDEMPOTENCY_RESULT_NOT_HOLD:"Этот резерв уже изменён. Обновите список, прежде чем повторять действие."
};
function message(error:unknown){const code=error instanceof Error?error.message:"UNKNOWN";return errors[code]||"Операция не подтверждена. Обновите список перед повтором. Код: "+(/^[A-Z0-9_]+$/.test(code)?code:"NETWORK_ERROR");}
export function LocalCoreWorkspace(){
  const [data,setData]=useState<Workspace|null>(null),[csrf,setCsrf]=useState(""),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false);
  const [error,setError]=useState(""),[notice,setNotice]=useState(""),[selection,setSelection]=useState("");
  const [checkIn,setCheckIn]=useState(day(1)),[checkOut,setCheckOut]=useState(day(3)),[guests,setGuests]=useState(1);
  const [quote,setQuote]=useState<Quote|null>(null),[hold,setHold]=useState<Hold|null>(null),[key,setKey]=useState("");
  const [now,setNow]=useState(Date.now()),releaseKeys=useRef(new Map<string,string>());
  const unit=data?.units.find(u=>u.unitId+":"+u.ratePlanId===selection);
  async function refresh(token=csrf){const next=await request<Workspace>("workspace",token);setData(next);setSelection(old=>old||(next.units[0]?next.units[0].unitId+":"+next.units[0].ratePlanId:""));}
  useEffect(()=>{let alive=true;session().then(async s=>{if(!alive)return;setCsrf(s.csrf);await refresh(s.csrf);}).catch(e=>{if(alive)setError(message(e));}).finally(()=>{if(alive)setLoading(false);});return()=>{alive=false;};},[]);
  useEffect(()=>{const id=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(id);},[]);
  function invalidate(){setQuote(null);setHold(null);setKey("");setNotice("");setError("");}
  async function calculate(event:React.FormEvent){
    event.preventDefault();if(!unit)return;setBusy(true);invalidate();
    try{const next=await request<Quote>("quotes",csrf,{unitId:unit.unitId,ratePlanId:unit.ratePlanId,checkIn,checkOut,guests});setQuote(next);setKey(crypto.randomUUID());}
    catch(e){setError(message(e));}finally{setBusy(false);}
  }
  async function reserve(){
    if(!quote||!key)return;setBusy(true);setError("");
    try{const next=await request<Hold>("holds",csrf,{quoteId:quote.quoteId},key);setHold(next);setNotice("Резерв сохранён в PostgreSQL: "+next.confirmationCode);await refresh();}
    catch(e){setError(message(e));}finally{setBusy(false);}
  }
  async function release(reservation:Reservation){
    setBusy(true);setError("");
    let idem=releaseKeys.current.get(reservation.reservationId);if(!idem){idem=crypto.randomUUID();releaseKeys.current.set(reservation.reservationId,idem);}
    try{await request("release",csrf,{reservationId:reservation.reservationId},idem);setNotice("Резерв снят. Апартамент снова доступен на эти даты.");setQuote(null);setHold(null);await refresh();}
    catch(e){setError(message(e));}finally{setBusy(false);}
  }
  return <main className="localWorkspace">
    <div className="localIntro"><div><span className="localEyebrow">VIEWS · ЛОКАЛЬНЫЙ CORE</span><h1>Рабочая область бронирования</h1>
      <p>Интерфейс → Core → PostgreSQL. Расчёт, резерв и снятие резерва выполняются сервером.</p></div><a href="/?api=demo">Открыть демо-интерфейс</a></div>
    <div className="localWarning"><strong>Только тестовые данные.</strong> Это локальная сессия сотрудника, а не вход в production. Реальные апартаменты, гости, налоги и платежи не подключены.</div>
    {error&&<div className="localError" role="alert">{error}</div>}
    {notice&&<div className="localSuccess" role="status">{notice}</div>}
    {loading?<p role="status">Подключение к локальному Core…</p>:<>
      <div className="localToolbar"><div><strong>{data?name(data.property.name):"Нет связи с Core"}</strong><small>{data?"Данные БД: "+dateTime(data.databaseTime)+" · Asia/Tashkent":"Серверные данные не получены"}</small></div>
        <button disabled={busy} onClick={async()=>{setBusy(true);setError("");try{await refresh();}catch(e){setError(message(e));}finally{setBusy(false);}}}>Обновить из БД</button></div>
      {data&&<div className="localColumns"><section className="localPanel"><h2>1. Рассчитать стоимость</h2>
        <form onSubmit={calculate}><fieldset disabled={busy}><label>Апартамент<select aria-label="Апартамент" value={selection} onChange={e=>{invalidate();setSelection(e.target.value);}}>
          {data.units.map(u=><option key={u.unitId+u.ratePlanId} value={u.unitId+":"+u.ratePlanId}>{u.code} · {name(u.unitTypeName)}</option>)}</select></label>
          <div className="localDates"><label>Заезд<input aria-label="Заезд" required type="date" min={day(0)} value={checkIn} onChange={e=>{invalidate();setCheckIn(e.target.value);}}/></label>
          <label>Выезд<input aria-label="Выезд" required type="date" min={checkIn} value={checkOut} onChange={e=>{invalidate();setCheckOut(e.target.value);}}/></label></div>
          <label>Взрослые гости<select aria-label="Взрослые гости" value={guests} onChange={e=>{invalidate();setGuests(Number(e.target.value));}}>{Array.from({length:unit?.maxGuests||1},(_,i)=><option key={i} value={i+1}>{i+1}</option>)}</select></label>
          <p className="localHint">Заезд в 14:00, выезд в 12:00 по Ташкенту. {unit?"Тестовая базовая цена: "+uzs(unit.baseNightlyMinor)+" за ночь.":""} Сумма ниже рассчитывается Core, не браузером.</p>
          <button className="primary" type="submit" disabled={!unit||busy}>{busy?"Выполняется…":"Рассчитать через Core"}</button></fieldset></form>
        </section><section className="localPanel"><h2>2. Создать резерв</h2>
          {!quote?<p className="localHint">Выберите апартамент и даты. Здесь появится реальный расчёт из локальной базы.</p>:<>
            <p>Ночей: <strong>{quote.nights}</strong></p><div className="localAmount">{uzs(quote.totalMinor)}</div>
            <div className="localQuoteLines">{quote.lines.map((line,i)=><div key={line.code+i}><span>{name(line.label)}</span><b>{uzs(line.amountMinor)}</b></div>)}</div>
            <p className="localHint">Расчёт действителен до {dateTime(quote.expiresAt)}. Резерв — на 15 минут. Оплата не выполняется.</p>
            <button className="primary" onClick={reserve} disabled={busy||!!hold||Date.parse(quote.expiresAt)<=now}>{hold?"Резерв создан":"Создать тестовый резерв"}</button>
            {Date.parse(quote.expiresAt)<=now&&!hold&&<p role="status">Расчёт истёк. Рассчитайте стоимость заново.</p>}
            {hold&&<div className="localReceipt"><strong>{hold.confirmationCode}</strong><span>Сохранён до {dateTime(hold.holdExpiresAt)}</span><small>Данные сохраняются после перезагрузки страницы.</small></div>}
          </>}
        </section></div>}
      <section className="localPanel"><h2>3. Резервы в PostgreSQL</h2><p className="localHint">Последние 50 записей тестового объекта. Снятие резерва освобождает апартамент; финансовая операция не создаётся.</p>
        {!data?.reservations.length?<p>Записей пока нет.</p>:<div className="localReservationList">{data.reservations.map(r=><article key={r.reservationId} data-reservation-id={r.reservationId}>
          <div><strong>{r.confirmationCode}</strong><span>{r.unitCode} · {dateTime(r.checkInAt)} — {dateTime(r.checkOutAt)}</span></div>
          <div><b>{uzs(r.totalMinor)}</b><span className={r.activeHold?"localActive":"localMuted"}>{r.status==="hold"?(r.activeHold?"Временный резерв":"Срок резерва истёк"):r.status==="cancelled"?"Отменён":r.status}</span></div>
          {r.status==="hold"&&<button disabled={busy} onClick={()=>release(r)}>Снять резерв</button>}
        </article>)}</div>}
        {data?.reservationsTruncated&&<p className="localHint">Показаны последние 50 записей, не весь архив.</p>}
      </section>
    </>}
  </main>;
}
