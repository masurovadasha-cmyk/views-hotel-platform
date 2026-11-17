import {useRef,useState} from 'react';
import {demoMoney} from './money';
type Quote={quoteId:string;expiresAt:string;checkInAt:string;checkOutAt:string;currency:string;totalMinor:string;lines:{code:string;amountMinor:string;currency:string}[]};
type Props={api:(route:string,body?:unknown,session?:string,key?:string)=>Promise<any>;busy:boolean;run:(work:()=>Promise<void>)=>Promise<void>;reload:()=>Promise<void>};
export function QuoteHoldForm({api,busy,run,reload}:Props){
 const [id,setId]=useState(''),[quote,setQuote]=useState<Quote|null>(null),[held,setHeld]=useState('');
 const command=useRef<string|null>(null);
 return <section aria-label="Предложение и бронирование"><h2>Персональное предложение</h2>
  <p>Введите ID предложения, выданного сотрудником вашему аккаунту. Это ещё не поиск объектов.</p>
  <form onSubmit={e=>{e.preventDefault();void run(async()=>{
   setQuote(null);setHeld('');const result=await api('sms/quotes/'+encodeURIComponent(id.trim()));
   if(!demoMoney(result.totalMinor,result.currency)||!Array.isArray(result.lines))throw Error('Некорректная цена');
   setQuote(result);command.current=crypto.randomUUID();
  });}}>
   <label>ID предложения<input required pattern="[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}" value={id} disabled={busy||!!command.current} onChange={e=>setId(e.target.value)}/></label>
   <button disabled={busy||!!command.current}>Показать цену</button>
  </form>
  {quote&&<article><h3>Расчёт проживания</h3><p>{quote.checkInAt} — {quote.checkOutAt}</p>
   <ul>{quote.lines.map((line,i)=><li key={i}>{line.code}: {demoMoney(line.amountMinor,line.currency)}</li>)}</ul>
   <p>Итого: {demoMoney(quote.totalMinor,quote.currency)}</p><p>Предложение до: {quote.expiresAt}</p>
   {!held&&<button disabled={busy} onClick={()=>void run(async()=>{
    const result=await api('sms/holds',{quoteId:quote.quoteId},undefined,command.current!);
    if(result.status!=='hold'||!result.reservationId)throw Error('Бронь не подтверждена');
    setHeld(result.holdExpiresAt);await reload();
   })}>Забронировать / проверить повторно</button>}
   {held&&<p role="status">Срок оплаты при создании: {held}. Текущий статус — в «Моих поездках».</p>}
   {held&&<button disabled={busy} onClick={()=>{command.current=null;setQuote(null);setHeld('');setId('');}}>Другое предложение</button>}
  </article>}
 </section>;
}
