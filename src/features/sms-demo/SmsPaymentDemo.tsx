import './sms-demo.css';
import {QuoteHoldForm} from './QuoteHoldForm';
import {demoMoney} from './money';
import {useRef,useState} from 'react';
type Trip={id:string;confirmationCode:string;status:string;totalMinor:string;currency:string};
export function SmsPaymentDemo(){
 const [phone,setPhone]=useState('+998000000001'),[code,setCode]=useState(''),[challenge,setChallenge]=useState('');
 const [token,setToken]=useState(''),[trips,setTrips]=useState<Trip[]>([]),[cursor,setCursor]=useState<string|null>(null);
 const [busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[retry,setRetry]=useState<string|null>(null);const running=useRef(false);
 async function api(route:string,body?:unknown,session=token,key?:string){
  const response=await fetch('/sms-demo-api/'+route,{method:body===undefined?'GET':'POST',credentials:'omit',headers:{'X-Views-Sms-Demo':'1','Content-Type':'application/json',...(key?{'Idempotency-Key':key}:{}),...(session?{Authorization:'Bearer '+session}:{})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(12000)});
  const result=await response.json();if(!response.ok)throw Error(result.message||'DEMO_REQUEST_FAILED');return result;
 }
 async function run(work:()=>Promise<void>){
  if(running.current)return;running.current=true;setBusy(true);setNotice('');
  try{if(!navigator.onLine)throw Error('Нет сети. Повторите запрос после подключения.');await work();}
  catch(e){setNotice(e instanceof Error?e.message:'Ошибка запроса');}finally{running.current=false;setBusy(false);}
 }
 async function load(session=token,after?:string){
  const page=await api('sms/trips'+(after?'?cursor='+encodeURIComponent(after):''),undefined,session);
  if(!Array.isArray(page.items))throw Error('INVALID_TRIPS_RESPONSE');setTrips(old=>after?[...old,...page.items]:page.items);setCursor(page.nextCursor);
 }
 async function pay(id:string){
  setRetry(id);const receipt=await api('sms/demo-payment',{reservationId:id});
  if(receipt.simulation!==true||receipt.reservationId!==id||receipt.paymentStatus!=='captured'||receipt.bookingStatus!=='confirmed')throw Error('Платёж не подтверждён. Повторите проверку; новая сумма не списывается.');
  setRetry(null);await load();setNotice('Тестовая оплата подтверждена. Реальные деньги не списывались.');
 }
 return <main className="app sms-demo" lang="ru">
  <h1>VIEWS · Локальное демо</h1><p>Только синтетические данные. SMS-код находится в консоли запуска. Реальных платежей нет.</p>
  {!token?<form onSubmit={e=>{e.preventDefault();void run(async()=>{
   if(!challenge){const r=await api('sms',{phone,locale:'ru'});setChallenge(r.challengeId);}
   else{const r=await api('verify',{challengeId:challenge,code});if(!/^vgs_[A-Za-z0-9_-]{43}$/.test(r.token))throw Error('INVALID_SESSION');setToken(r.token);setCode('');await load(r.token);}
  });}}>
   <label>Телефон <input aria-label="Телефон" value={phone} disabled={busy||!!challenge} onChange={e=>setPhone(e.target.value)} /></label>
   {challenge&&<label>Код <input aria-label="Код" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={e=>setCode(e.target.value)} disabled={busy}/></label>}
   <button disabled={busy}>{challenge?'Войти':'Получить код'}</button>
  </form>:<>
   <QuoteHoldForm api={api} busy={busy} run={run} reload={()=>load()}/>
   <h2>Мои поездки</h2><button disabled={busy} onClick={()=>void run(()=>load())}>Обновить поездки</button>
   <button disabled={busy} onClick={()=>void run(async()=>{await api('logout',{});setToken('');setTrips([]);setChallenge('');setRetry(null);})}>Выйти</button>
   {!trips.length&&<p>Поездок пока нет. Для демо нужна бронь, привязанная к этому гостю.</p>}
   {trips.map(t=><article key={t.id}><h3>{t.confirmationCode}</h3><p>{({hold:'Ожидает оплаты',confirmed:'Подтверждена',cancelled:'Отменена'} as Record<string,string>)[t.status]||t.status} · {demoMoney(t.totalMinor,t.currency)||'Цена недоступна'}</p>
    {t.status==='hold'&&<button disabled={busy||!!retry&&retry!==t.id||!demoMoney(t.totalMinor,t.currency)} onClick={()=>void run(()=>pay(t.id))}>Тестовая оплата — без списания</button>}
   </article>)}
   {retry&&<button disabled={busy} onClick={()=>void run(()=>pay(retry))}>Повторить проверку оплаты</button>}
   {cursor&&<button disabled={busy} onClick={()=>void run(()=>load(token,cursor))}>Ещё поездки</button>}
  </>}
  <p role="status" aria-live="polite">{busy?'Выполняется…':notice}</p>
 </main>;
}
