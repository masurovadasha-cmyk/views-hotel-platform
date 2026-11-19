import {useEffect,useState,type ReactNode} from 'react';
import {partnerHostTitles,validInspection,validSchedule} from './partner-host-model';
import './partner-host-workbench.css';
type Props={screenId:string;onNavigate:(id:string)=>void};
const hostServices=['Уборка','Прачечная','Маркет','Трансферы','Экскурсии'];
const queue=[['TX-809','Трансфер','SP-TX-001'],['LA-1081','Прачечная','SP-GN-002'],['MK-2041','Доставка','SP-MK-001']];
const money=(v:number)=>new Intl.NumberFormat('ru').format(v)+' UZS';
export function PartnerHostWorkbench({screenId,onNavigate}:Props){
 const [notice,setNotice]=useState(''),[rejection,setRejection]=useState(''),[accepted,setAccepted]=useState(false),[declined,setDeclined]=useState(false);
 const [stage,setStage]=useState(0),[message,setMessage]=useState(''),[messages,setMessages]=useState<string[]>([]);
 const [checks,setChecks]=useState<Record<string,boolean>>({}),[km,setKm]=useState('32450'),[charge,setCharge]=useState('80');
 const [issued,setIssued]=useState(false),[returned,setReturned]=useState(false),[damage,setDamage]=useState(false),[delivery,setDelivery]=useState(false);
 const [attendees,setAttendees]=useState<Record<string,boolean>>({}),[tourStarted,setTourStarted]=useState(false),[ticketAccepted,setTicketAccepted]=useState(false);
 const [date,setDate]=useState('2030-10-11'),[start,setStart]=useState('09:00'),[end,setEnd]=useState('21:00'),[schedule,setSchedule]=useState<string[]>([]);
 const [services,setServices]=useState<Record<string,boolean>>({Уборка:true,Прачечная:true,Маркет:true,Трансферы:true,Экскурсии:false});
 const [price,setPrice]=useState('120000'),[effective,setEffective]=useState('2030-10-12'),[priceSaved,setPriceSaved]=useState('120000');
 const [hostOrder,setHostOrder]=useState('CL-1042'),[portal,setPortal]=useState(false),[report,setReport]=useState(false);
 useEffect(()=>setNotice(''),[screenId]);
 const checked=(key:string)=>!!checks[key];
 const checkbox=(key:string,label:string)=><label className="phCheck"><input type="checkbox" checked={checked(key)} onChange={e=>setChecks(old=>({...old,[key]:e.target.checked}))}/>{label}</label>;
 const card=(label:string,value:ReactNode)=><div className="phCard"><small>{label}</small><strong>{value}</strong></div>;
 const action=(label:string,fn:()=>void,disabled=false)=><button type="button" className="primary" disabled={disabled} onClick={fn}>{label}</button>;
 const go=(label:string,id:string)=>action(label,()=>onNavigate(id));
 const decline=()=>{setDeclined(true);setNotice('Демо-отказ сохранён только в памяти: '+rejection.trim());};
 const acceptance=<><div className="phGrid">{card('Заказ','TX-809 · TAS → NRG U-Tower')}{card('Подача','14:20 · демонстрационное время')}{card('Сумма из макета',money(180000))}{card('Выплата партнёру','По договорному расчёту; не рассчитана')}</div>
  {checkbox('terms','Ознакомлен с демонстрационными условиями')}
  {action(accepted?'Принят в демо':'Принять в демо',()=>{setAccepted(true);setDeclined(false);setNotice('Демо-заказ принят. Внешний партнёр не уведомлён.');},!checked('terms')||accepted)}
  {accepted&&go('Открыть исполнение','SP-GN-003')}
  <label>Причина отказа<textarea maxLength={500} value={rejection} onChange={e=>setRejection(e.target.value)}/></label>
  {action('Отказаться в демо',decline,rejection.trim().length<5||declined)}
 </>;
 const inspection=<><div className="phCar" role="img" aria-label="Схема автомобиля для демонстрационного осмотра">🚘<span>{damage?'Отмечено повреждение':'Повреждения не отмечены'}</span></div>
  <label>Пробег, км<input inputMode="numeric" value={km} onChange={e=>setKm(e.target.value)}/></label>
  <label>Заряд, %<input inputMode="numeric" value={charge} onChange={e=>setCharge(e.target.value)}/></label>
  <label className="phCheck"><input type="checkbox" checked={damage} onChange={e=>setDamage(e.target.checked)}/>Повреждение обнаружено — пример</label>
  {checkbox('inspection','Сопоставил демонстрационные состояния до и после')}
  <p>Фото не загружаются. Реальные договоры, документы водителя и залог здесь не обрабатываются.</p></>;
 let body:ReactNode;
 switch(screenId){
  case 'SP-GN-001':body=<><p>Рабочая очередь · синтетические задания</p>{queue.map(([id,label,target])=><button className="phCard" key={id} onClick={()=>onNavigate(target)}><strong>{id} · {label}</strong><small>{id==='TX-809'&&accepted?'Принят в демо':'Ожидает просмотра'}</small></button>)}</>;break;
  case 'SP-GN-002':case 'SP-TX-001':body=acceptance;break;
  case 'SP-GN-003':body=<>{card('Заказ','TX-809')}{card('Состояние',['Принят','В пути','Прибыл','Выполнен в демо'][stage])}
   {!accepted&&<p>Сначала примите демонстрационный заказ.</p>}{go('Условия заказа','SP-GN-002')}
   <label>Сообщение диспетчеру — локальный черновик<textarea maxLength={500} value={message} onChange={e=>setMessage(e.target.value)}/></label>
   {action('Добавить в демо-переписку',()=>{setMessages(old=>[...old,message.trim()]);setMessage('');},message.trim().length<2)}
   <ul>{messages.map((text,i)=><li key={i}>{text}</li>)}</ul>
   {action('Следующий демо-статус',()=>setStage(n=>Math.min(3,n+1)),!accepted||stage===3)}
   {stage===3&&go('Посмотреть пример акта','SP-GN-004')}</>;break;
  case 'SP-TX-002':body=<>{card('Маршрут','TAS → NRG U-Tower')}
   <div className="phRoute" aria-label="Условная схема маршрута">TAS ━━━ ◉ ━━━ U-Tower</div><p>Схема, не живая карта. Геопозиция и рейс не отслеживаются.</p>
   {card('Пассажир','Демо-гость · без контактных данных')}{card('Состояние',['В пути','Прибыл','Пассажир в машине','Поездка завершена'][stage])}
   {action('Следующий этап поездки',()=>setStage(n=>Math.min(3,n+1)),!accepted||stage===3)}{!accepted&&go('Сначала принять заказ','SP-TX-001')}</>;break;
  case 'SP-MK-001':body=<>{card('Заказ','MK-2041 · NRG U-Tower #235')}{card('Пример времени','18:20')}
   <div className="phRoute">Склад ━━━ ◉ ━━━ #235</div><p>Условный маршрут, не навигация курьера.</p>
   {checkbox('recipient','Демонстрационная передача получателю проверена')}{checkbox('package','Упаковка проверена в примере')}
   {action(delivery?'Передача отмечена в демо':'Отметить демо-доставку',()=>{setDelivery(true);setNotice('Только локальная отметка. Заказ Core не изменён.');},delivery||!checked('recipient')||!checked('package'))}</>;break;
  case 'SP-CR-001':body=<>{card('Заказ','CR-601')}{card('Документы','Реальные документы недоступны; только checklist примера')}
   {checkbox('name','Имя в демонстрационном договоре совпадает')}{checkbox('licence','Пример срока водительских прав проверен')}{checkbox('eligibility','Демонстрационные условия допуска проверены')}
   {action('Одобрить только демо-допуск',()=>{setChecks(old=>({...old,driver:true}));setNotice('Демо-допуск отмечен, юридическая верификация не выполнялась.');},!checked('name')||!checked('licence')||!checked('eligibility'))}
   {checked('driver')&&go('К демонстрационной выдаче','SP-CR-002')}</>;break;
  case 'SP-CR-002':body=<>{card('Выдача','CR-601 · 11 октября, 10:00 · пример')}{inspection}{checkbox('contract','Ознакомлен с демонстрационным договором')}
   {action(issued?'Демо-выдача отмечена':'Подтвердить демо-выдачу',()=>{setIssued(true);setNotice('Выдача отмечена только в демо.');},issued||!checked('driver')||!checked('inspection')||!checked('contract')||!validInspection(km,charge))}
   {!checked('driver')&&go('Проверка допуска','SP-CR-001')}{issued&&go('Приём автомобиля','SP-CR-003')}</>;break;
  case 'SP-CR-003':body=<>{card('Возврат','CR-601 · 13 октября, 10:00 · пример')}{inspection}
   {card('Доплата','Не рассчитывается: нужен серверный акт')}{action(returned?'Демо-возврат отмечен':'Закрыть пример возврата',()=>{setReturned(true);setNotice('Демо-возврат отмечен без начислений.');},returned||!issued||!checked('inspection')||!validInspection(km,charge))}
   {!issued&&go('Сначала пример выдачи','SP-CR-002')}</>;break;
  case 'SP-EX-001':body=<>{card('Группа','Старый Ташкент · 11 октября, 10:00')}{card('Участники','8 демонстрационных гостей')}{card('Язык и место','Русский · Чорсу')}{go('Открыть группу','SP-EX-002')}</>;break;
  case 'SP-EX-002':body=<><p>Синтетический список. Реальные имена и контакты не загружаются.</p>{Array.from({length:8},(_,i)=>String(i+1)).map(id=><label key={id} className="phCheck"><input type="checkbox" checked={!!attendees[id]} onChange={e=>setAttendees(old=>({...old,[id]:e.target.checked}))}/>Демо-участник {id}</label>)}
   {card('На месте',Object.values(attendees).filter(Boolean).length+' из 8')}{action(tourStarted?'Демо-группа начала экскурсию':'Начать демо-экскурсию',()=>setTourStarted(true),tourStarted||Object.values(attendees).filter(Boolean).length!==8)}</>;break;
  case 'SP-TK-001':body=<>{card('Заявка','TK-801 · Ташкент → Самарканд')}{card('Пассажир','Демо-пассажир, без документов')}{card('Предложение','Цена и наличие не проверены')}
   {action(ticketAccepted?'Принято в демо':'Принять демо-заявку',()=>setTicketAccepted(true),ticketAccepted)}{ticketAccepted&&go('Выписка и изменения','SP-TK-002')}</>;break;
  case 'SP-TK-002':body=<>{card('Заявка','TK-801')}{card('Статус','Результат выписки неизвестен — пример')}{card('Следующий шаг','Сверка с поставщиком, без повторной оплаты')}
   <button disabled>Проверить у поставщика — API не подключён</button><p>Билет и PNR не создаются. Этот сценарий не подтверждает покупку.</p>{go('Назад к заявке','SP-TK-001')}</>;break;
  case 'SP-GN-004':body=<>{card('Демо-начисление',money(180000))}{card('Демо-комиссия',money(18000))}{card('Иллюстративный остаток',money(162000))}{card('Статус','Пример акта на согласовании, не задолженность')}
   {action(report?'Скрыть расчёт':'Открыть пример расчёта',()=>setReport(!report))}{report&&<p>180 000 − 18 000 = 162 000 UZS. Это числа из макета, не реальная комиссия или выплата.</p>}<button disabled>Выплата недоступна</button></>;break;
  case 'SP-GN-005':body=<form onSubmit={e=>{e.preventDefault();if(validSchedule(date,start,end)){setSchedule(old=>[...old,`${date}: ${start}–${end}`]);setNotice('Демо-интервал сохранён в памяти.');}}}>
   <label>Дата<input type="date" required value={date} onChange={e=>setDate(e.target.value)}/></label><label>Начало<input type="time" required value={start} onChange={e=>setStart(e.target.value)}/></label><label>Конец<input type="time" required value={end} onChange={e=>setEnd(e.target.value)}/></label>
   <button className="primary" disabled={!validSchedule(date,start,end)}>Добавить демо-доступность</button><ul>{schedule.map((x,i)=><li key={i}>{x}<button type="button" onClick={()=>setSchedule(old=>old.filter((_,j)=>j!==i))}>Удалить интервал {i+1}</button></li>)}</ul></form>;break;
  case 'SP-GN-006':body=<>{card('Организация','Демо-партнёр')}{card('Приглашение','Синтетический пример, не проверено сервером')}{card('Роль','Партнёр · демонстрационный просмотр')}
   {action(portal?'Демо-портал открыт':'Открыть демо-портал',()=>setPortal(true))}{portal&&<nav>{go('Входящие','SP-GN-001')}{go('Календарь','SP-GN-005')}{go('Акты','SP-GN-004')}</nav>}<p>Не является входом в аккаунт и не выдаёт права.</p></>;break;
  case 'SH-GN-001':body=<><div className="phGrid">{hostServices.map(s=><label className="phCheck phCard" key={s}><input type="checkbox" checked={services[s]} onChange={e=>setServices(old=>({...old,[s]:e.target.checked}))}/>{s}<small>{services[s]?'Включено в демо':'Выключено в демо'}</small></label>)}</div>
   <p>Изменения не затрагивают активные заказы. В демо они не отправляются серверу.</p>{action('Сохранить демо-настройки',()=>setNotice('Настройки удерживаются только до перезагрузки страницы.'))}{go('Цена и комиссия','SH-GN-002')}</>;break;
  case 'SH-GN-002':body=<form onSubmit={e=>{e.preventDefault();if(/^\d{1,9}$/.test(price)&&effective){setPriceSaved(price);setNotice('Демо-цена сохранена. Реальные заказы и тарифы не изменились.');}}}>
   {card('Услуга','Стандартная уборка')}<label>Демо-цена, UZS<input inputMode="numeric" required pattern="[0-9]{1,9}" value={price} onChange={e=>setPrice(e.target.value)}/></label>
   <label>Демо-дата вступления<input type="date" required value={effective} onChange={e=>setEffective(e.target.value)}/></label>{card('Комиссия','По договору — не рассчитана')}{card('Сохранённый пример',money(Number(priceSaved)))}
   <p>Активные заказы сохраняют старую цену. Это демонстрация формы, не финансовое изменение.</p><button className="primary">Сохранить демо-цену</button></form>;break;
  case 'SH-GN-003':body=<>{[['CL-1042','Уборка · выполняется ·14:40'],['LA-1081','Прачечная · возврат завтра'],['TX-809','Трансфер · завершён']].map(([id,label])=><label key={id} className="phCheck phCard"><input type="radio" name="host-order" checked={hostOrder===id} onChange={()=>setHostOrder(id)}/><strong>{id}</strong><span>{label}</span></label>)}
   {action('Открыть пример '+hostOrder,()=>setNotice(hostOrder+' — синтетический заказ. Детали Core не запрашивались.'))}</>;break;
  case 'SH-GN-004':body=<><div className="phGrid">{card('Демо-выручка',money(4200000))}{card('Демо-возвраты',money(120000))}{card('Демо-доход хоста',money(420000))}{card('Демо-статус выплаты','На согласовании')}</div>
   <h3>Выполнение в срок — демонстрация</h3><div className="phBars" role="img" aria-label="Иллюстративные показатели за семь дней, от55 до70 процентов">{[55,60,62,61,66,67,70].map((v,i)=><div key={i}><span style={{height:v+'px'}}/><small>{i+4} окт ·{v}%</small></div>)}</div>
   {action(report?'Скрыть пояснение':'Посмотреть пример расчёта',()=>setReport(!report))}{report&&<p>Значения взяты из макета и не образуют бухгалтерский отчёт. Реальные комиссии, налоги и выплаты требуют Core.</p>}</>;break;
  default:body=<p>Для этого ID нет партнёрского/хостового сценария.</p>;
 }
 return <section className="partnerHostWorkbench" data-testid="partner-host-workbench" data-screen-id={screenId} lang="ru"><header><small>{screenId.startsWith('SH-')?'Хост':'Партнёр'} · синтетическая рабочая область</small><h2>{partnerHostTitles[screenId]??screenId}</h2></header>
  <p className="phDisclosure">Локальная демонстрация. Все записи вымышлены; изменения только в памяти вкладки. Нет API, реальных заказов, платежей, документов или прав доступа.</p>
  {body}{notice&&<p className="phNotice" role="status">{notice}</p>}
 </section>;
}
