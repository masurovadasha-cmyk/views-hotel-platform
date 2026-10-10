import {useEffect,useRef,useState} from 'react';
import {request} from './LocalCoreWorkspace';
import {useStaffLocale} from './StaffLocale';
import {localeTags} from './staff-locale';
type Task={taskId:string;unitCode:string;createdAt:string;assignment:'mine'|'available'|'assigned'};
type Queue={items:Task[];truncated:boolean;syntheticData:true};
type Attempt={task:Task;action:'claim'|'release'|'complete';key:string};
export function HousekeepingWorkspace({staffCsrf}:{staffCsrf:string}){
 const {t,locale}=useStaffLocale();const [queue,setQueue]=useState<Queue|null>(null),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [busy,setBusy]=useState(false),[pending,setPending]=useState<Attempt|null>(null),[confirmation,setConfirmation]=useState<Task|null>(null);
 const [search,setSearch]=useState(''),[mine,setMine]=useState(false);const submitting=useRef(false),title=useRef<HTMLHeadingElement>(null),trigger=useRef<HTMLElement|null>(null);
 const refresh=()=>request<Queue>('housekeeping',staffCsrf).then(setQueue);
 useEffect(()=>{let alive=true;request<Queue>('housekeeping',staffCsrf).then(q=>{if(alive)setQueue(q);}).catch(()=>{if(alive)setError('Очередь уборки недоступна. Проверьте доступ и повторите загрузку.');});return()=>{alive=false;};},[staffCsrf]);
 async function act(attempt:Attempt){
  if(submitting.current)return;submitting.current=true;setBusy(true);setPending(attempt);setConfirmation(null);setError('');setNotice('');
  try{
   await request('housekeeping',staffCsrf,{taskId:attempt.task.taskId,action:attempt.action},attempt.key);setPending(null);setNotice('Действие сохранено.');
   try{await refresh();}catch{setError('Действие сохранено, но список не обновился. Повторите загрузку.');}
  }catch(e){
   const code=e instanceof Error?e.message:'';
   if(/^(HOUSEKEEPING_(FORBIDDEN|DISABLED|TASK_FORBIDDEN|TASK_CHANGED|UNIT_OCCUPIED|ALREADY_ASSIGNED|NOT_ASSIGNED)|INVALID_HOUSEKEEPING_REQUEST|CSRF_REQUIRED|STAFF_PERMISSION_DENIED)$/.test(code)){
    setPending(null);setError('Задача изменилась или недоступна. Обновите очередь перед следующим действием.');
   }else setError('Ответ не получен. Повторите то же действие, чтобы проверить результат без дубликата.');
  }finally{submitting.current=false;setBusy(false);}
 }
 const start=(task:Task,action:Attempt['action'])=>void act({task,action,key:crypto.randomUUID()});
 const tasks=queue?.items.filter(task=>(!mine||task.assignment==='mine')&&task.unitCode.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()))||[];
 return <main className="localWorkspace housekeepingWorkspace">
  <span className="localEyebrow">{t('VIEWS · КАБИНЕТ ГОРНИЧНОЙ')}</span><h1 ref={title} tabIndex={-1}>{t('Задачи уборки')}</h1>
  <p className="localWarning">{t('Тестовая очередь после выезда. Подтверждайте готовность только после завершения уборки.')}</p>
  {error&&<p role="alert" className="localError">{t(error)}</p>}{notice&&<p role="status" className="localSuccess">{t(notice)}</p>}
  {pending&&!busy&&<button onClick={()=>void act(pending)}>{t('Повторить то же действие')}</button>}
  <section className="localPanel">
   <div className="housekeepingFilters"><label>{t('Поиск по номеру')}<input value={search} onChange={e=>setSearch(e.target.value)}/></label>
    <label><input type="checkbox" checked={mine} onChange={e=>setMine(e.target.checked)}/>{t('Только мои задачи')}</label>
    <button disabled={busy} onClick={()=>{setError('');void refresh().catch(()=>setError('Очередь уборки недоступна. Проверьте доступ и повторите загрузку.'));}}>{t('Обновить список')}</button>
   </div>
   {queue?.truncated&&<p role="status">{t('Показаны первые 100 задач. Поиск работает только по загруженной части очереди.')}</p>}
   {queue&&tasks.length===0&&<p>{t('Задач по выбранному фильтру нет.')}</p>}
   <ul className="housekeepingTasks">{tasks.map(task=><li key={task.taskId}>
    <h2>{t('Номер {unit}',{unit:task.unitCode})}</h2>
    <p>{new Intl.DateTimeFormat(localeTags[locale],{timeZone:'Asia/Tashkent',year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(task.createdAt))} · {t(task.assignment==='mine'?'Моя задача':task.assignment==='available'?'Свободная задача':'В работе у коллеги')}</p>
    {task.assignment==='available'&&<button disabled={busy||!!pending} onClick={()=>start(task,'claim')}>{t('Взять задачу')}</button>}
    {task.assignment==='mine'&&<><button disabled={busy||!!pending} onClick={e=>{trigger.current=e.currentTarget;setConfirmation(task);}}>{t('Уборка завершена')}</button>
     <button disabled={busy||!!pending} onClick={()=>start(task,'release')}>{t('Вернуть в очередь')}</button></>}
   </li>)}</ul>
  </section>
  {confirmation&&<CleaningConfirmation task={confirmation} onConfirm={()=>start(confirmation,'complete')} onClose={()=>setConfirmation(null)} restoreFocus={()=>{if(trigger.current?.isConnected)trigger.current.focus();else title.current?.focus();}}/>}
 </main>;
}
function CleaningConfirmation({task,onConfirm,onClose,restoreFocus}:{task:Task;onConfirm:()=>void;onClose:()=>void;restoreFocus:()=>void}){
 const {t}=useStaffLocale();const dialog=useRef<HTMLDivElement>(null),button=useRef<HTMLButtonElement>(null),restore=useRef(restoreFocus);restore.current=restoreFocus;
 useEffect(()=>{button.current?.focus();return()=>restore.current();},[]);
 return <div className="stayConfirmationBackdrop"><div ref={dialog} className="localPanel stayConfirmation" role="alertdialog" aria-modal="true" aria-labelledby="cleaning-title" aria-describedby="cleaning-description" onKeyDown={e=>{
  if(e.key==='Escape'){e.preventDefault();onClose();}
  if(e.key==='Tab'){const buttons=[...dialog.current!.querySelectorAll('button')];if(e.shiftKey&&document.activeElement===buttons[0]){e.preventDefault();buttons[buttons.length-1]?.focus();}else if(!e.shiftKey&&document.activeElement===buttons[buttons.length-1]){e.preventDefault();buttons[0]?.focus();}}
 }}>
  <h2 id="cleaning-title">{t('Подтвердить готовность номера')}</h2><p id="cleaning-description">{t('Номер {unit}',{unit:task.unitCode})}. {t('После подтверждения номер можно использовать для следующего тестового заселения.')}</p>
  <button ref={button} onClick={onConfirm}>{t('Подтвердить действие')}</button><button onClick={onClose}>{t('Отмена')}</button>
 </div></div>;
}
