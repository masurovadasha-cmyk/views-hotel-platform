import {useEffect,useRef,useState} from 'react';
import {request} from './LocalCoreWorkspace';
type Row={reservationId:string;confirmationCode:string;unitCode:string|null;status:string;checkInAt:string;checkOutAt:string};
type Group={total:number;truncated:boolean;items:Row[]};
type Board={property:{name:Record<string,string>;timezone:string};day:string;databaseTime:string;arrivals:Group;departures:Group;staying:Group};
export function ReceptionWorkspace({staffCsrf}:{staffCsrf:string}){
 const [data,setData]=useState<Board|null>(null),[day,setDay]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const sequence=useRef(0);
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
  {busy&&<p role="status">Загрузка сводки…</p>}{error&&<p role="alert" className="localError">{error}</p>}
  {data&&<>
   <p>Дата сводки: {data.day} · {data.property.timezone}. Обновлено: {format(data.databaseTime)}.</p>
   <div className="receptionGroups">{([['arrivals','Ожидаемые заезды'],['departures','Выезды по плану'],['staying','Сейчас проживают']] as const).map(([key,label])=>{
    const group=data[key];return <section className="localPanel" aria-label={label} key={key}>
     <h3>{label}: {group.total}</h3>
     {group.total===0?<p>Нет записей.</p>:<ul>{group.items.map(r=><li key={r.reservationId}>
      <strong>{r.confirmationCode}</strong><div>{r.unitCode||'Номер не назначен'} · {r.status==='confirmed'?'Подтверждена':'Заселён'}</div>
      <small>{format(r.checkInAt)} — {format(r.checkOutAt)}</small>
     </li>)}</ul>}
     {group.truncated&&<p>Показаны первые 100 из {group.total} записей.</p>}
    </section>;
   })}</div>
   <p className="localHint">Сводка доступна для просмотра. Оформление заселения и выезда ещё не подключено. Данные этого стенда тестовые.</p>
  </>}
 </section>;
}
