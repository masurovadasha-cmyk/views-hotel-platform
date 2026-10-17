import {useEffect,useRef,useState} from 'react';
import {request} from './LocalCoreWorkspace';
import {useStaffLocale} from './StaffLocale';
import {formatStaffMoney,localeTags} from './staff-locale';

const statuses={attention:'Требуют сверки',uncertain:'Результат неизвестен',blocked:'Провайдер не подключён',submitted:'Ожидает подтверждения',processing:'Обрабатывается',pending:'В очереди',completed:'Возврат подтверждён'};
const actions={investigating:'Проверка начата',provider_contacted:'Обращение к провайдеру',evidence_requested:'Запрошено подтверждение'};
type Refund={id:string;status:keyof typeof statuses;amountMinor:string;currency:string;provider:string;revision:string;externalCaptureId:string;externalRefundId:string|null};
type Detail=Refund&{reviews:Array<{id:string;action:keyof typeof actions;caseReference:string;observedStatus:keyof typeof statuses;createdAt:string}>};
type Queue={items:Refund[];nextCursor:string|null};
type Attempt={id:string;key:string;body:{expectedRevision:string;action:keyof typeof actions;caseReference:string}};
export function RefundReconciliationWorkspace({staffCsrf,canReview}:{staffCsrf:string;canReview:boolean}){
 const {t,locale}=useStaffLocale();
 const [queue,setQueue]=useState<Queue|null>(null),[detail,setDetail]=useState<Detail|null>(null),[status,setStatus]=useState('attention');
 const [action,setAction]=useState<keyof typeof actions>('investigating'),[reference,setReference]=useState('');
 const [busy,setBusy]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState(''),[pending,setPending]=useState<Attempt|null>(null);
 const running=useRef(true);
 const path='refund-reconciliation';
 const readQueue=(filter=status,cursor?:string)=>request<Queue>(path+'?'+new URLSearchParams({status:filter,...(cursor?{cursor}:{})}),staffCsrf);
 useEffect(()=>{let alive=true;running.current=true;setBusy(true);
  readQueue().then(value=>{if(alive)setQueue(value);}).catch(()=>{if(alive)setError('Очередь сверки недоступна. Повторите загрузку.');})
   .finally(()=>{if(alive){running.current=false;setBusy(false);}});return()=>{alive=false;};},[staffCsrf]);
 async function load(filter=status,cursor?:string){
  if(running.current)return;running.current=true;setBusy(true);setError('');setDetail(null);setQueue(null);setStatus(filter);
  try{setQueue(await readQueue(filter,cursor));}catch{setError('Очередь сверки недоступна. Повторите загрузку.');}finally{running.current=false;setBusy(false);}
 }
 async function open(id:string){
  if(running.current)return;running.current=true;setBusy(true);setError('');setNotice('');setDetail(null);setReference('');
  try{setDetail(await request<Detail>(path+'/'+id,staffCsrf));}catch{setError('Заявка недоступна. Обновите очередь и проверьте доступ.');}finally{running.current=false;setBusy(false);}
 }
 async function save(attempt:Attempt){
  if(running.current)return;running.current=true;setBusy(true);setPending(attempt);setError('');setNotice('');
  try{
   await request(path+'/'+attempt.id+'/reviews',staffCsrf,attempt.body,attempt.key);
   setPending(null);setReference('');setNotice('Проверка записана. Статус возврата не изменён.');
   try{setDetail(await request<Detail>(path+'/'+attempt.id,staffCsrf));}catch{setDetail(null);setError('Заявка недоступна. Обновите очередь и проверьте доступ.');}
  }catch(e){
   const code=e instanceof Error?e.message:'';
   if(['REFUND_REVIEW_STALE','REFUND_REVIEW_IDEMPOTENCY_CONFLICT','REFUND_REQUEST_NOT_FOUND','PROPERTY_FORBIDDEN','STAFF_PERMISSION_DENIED','INVALID_REFUND_REVIEW'].includes(code)){
    setPending(null);setDetail(null);setError('Заявка изменилась или недоступна. Откройте её заново перед проверкой.');
   }else setError('Ответ не получен. Повторите ту же запись проверки.');
  }finally{running.current=false;setBusy(false);}
 }
 const money=(item:Refund)=>['UZS','USD','EUR'].includes(item.currency)?formatStaffMoney(item.amountMinor,locale).replace(/UZS$/,item.currency):item.amountMinor+' '+item.currency;
 return <main className="localWorkspace refundWorkspace">
  <h1>{t('Сверка возвратов')}</h1><p className="localWarning">{t('Тестовый стенд. Подтверждение возврата поступает от провайдера. Запись проверки не отправляет деньги.')}</p>
  {error&&<p role="alert" className="localError">{t(error)}</p>}{notice&&<p role="status" className="localSuccess">{t(notice)}</p>}
  {pending&&!busy&&<button onClick={()=>void save(pending)}>{t('Повторить ту же запись')}</button>}
  <section className="localPanel"><div className="housekeepingFilters">
   <label>{t('Статус возврата')}<select value={status} disabled={busy||!!pending} onChange={e=>void load(e.target.value)}>{Object.entries(statuses).map(([key,label])=><option key={key} value={key}>{t(label)}</option>)}</select></label>
   <button disabled={busy||!!pending} onClick={()=>void load()}>{t('Обновить очередь сверки')}</button>
  </div>
  {queue?.items.length===0&&<p>{t('Возвратов по выбранному фильтру нет.')}</p>}
  <ul className="housekeepingTasks">{queue?.items.map(item=><li key={item.id}>
   <strong>{money(item)} · {item.provider}</strong><p>{t(statuses[item.status])}</p>
   <button disabled={busy||!!pending} onClick={()=>void open(item.id)}>{t('Открыть сверку')}</button>
  </li>)}</ul>
  {queue?.nextCursor&&<button disabled={busy||!!pending} onClick={()=>void load(status,queue.nextCursor!)}>{t('Следующие 50 заявок')}</button>}
  </section>
  {detail&&<section className="localPanel refundDetail" aria-label={t('Проверка возврата')}>
   <h2>{money(detail)} · {t(statuses[detail.status])}</h2>
   <p>{t('Транзакция списания')}: <span className="refundReference">{detail.externalCaptureId}</span></p>
   <p>{t('Транзакция возврата')}: <span className="refundReference">{detail.externalRefundId??'—'}</span></p>
   {canReview&&<form onSubmit={e=>{e.preventDefault();void save({id:detail.id,key:crypto.randomUUID(),body:{expectedRevision:detail.revision,action,caseReference:reference}});}}><fieldset disabled={busy||!!pending}>
    <label>{t('Действие проверки')}<select value={action} onChange={e=>setAction(e.target.value as keyof typeof actions)}>{Object.entries(actions).map(([key,label])=><option key={key} value={key}>{t(label)}</option>)}</select></label>
    <label>{t('Номер обращения')}<input required maxLength={100} pattern="[A-Za-z0-9][A-Za-z0-9._:/\-]{0,99}" value={reference} onChange={e=>setReference(e.target.value)}/></label>
    <p className="localHint">{t('Укажите служебный номер обращения латиницей, без документов и персональных данных.')}</p>
    <button className="primary" type="submit">{t('Записать проверку')}</button>
   </fieldset></form>}
   <h3>{t('История проверок')}</h3><p className="localHint">{t('Последние 100 записей. История не удаляется и не меняет статус возврата.')}</p>
   <ul>{detail.reviews.map(review=><li key={review.id}><strong>{t(actions[review.action])}</strong> · <span className="refundReference">{review.caseReference}</span> · {t(statuses[review.observedStatus])} · {new Intl.DateTimeFormat(localeTags[locale],{timeZone:'Asia/Tashkent',dateStyle:'short',timeStyle:'short'}).format(new Date(review.createdAt))}</li>)}</ul>
  </section>}
 </main>;
}
