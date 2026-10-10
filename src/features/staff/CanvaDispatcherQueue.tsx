import {useMemo,useState} from "react";
import {initialOrders} from "../../data/demo";
import type {ServiceOrder} from "../../domain/types";
import {canvaServices} from "../../data/canvaServices";

type QueueStatus="all"|"open"|"completed";
const fmt=(value:number)=>new Intl.NumberFormat("ru-RU").format(value);
export function CanvaDispatcherQueue({orders=initialOrders,live=false}:{orders?:ServiceOrder[];live?:boolean}){
 const [filter,setFilter]=useState<QueueStatus>("all");
 const [selected,setSelected]=useState<string|null>(null);
 const rows=useMemo(()=>orders.filter(o=>filter==="all"||(filter==="completed"?o.status==="done":o.status!=="done")),[orders,filter]);
 const current=rows.find(o=>o.id===selected);
 return <section className="canvaDispatcherQueue" aria-label="Диспетчер услуг VIEWS">
  <header><div><small>VIEWS · CANVA v0.4 · ДИСПЕТЧЕР</small><h2>Очередь услуг</h2><p>{live?"Состояния получены из подключённого API.":"Демо-данные · действия не отправляются на сервер."}</p></div><span className="canvaQueueCount">{rows.length} заказов</span></header>
  <nav aria-label="Фильтр очереди">
   {([["all","Все"],["open","В работе"],["completed","Завершены"]] as const).map(([id,label])=><button type="button" key={id} aria-pressed={filter===id} onClick={()=>setFilter(id)}>{label}</button>)}
  </nav>
  <div className="canvaDispatcherRows">{rows.length===0?<p role="status">Заказов по выбранному фильтру нет.</p>:rows.map(o=><article key={o.id}>
   <div><b>{o.title}</b><small>{o.id} · {o.unit||"Объект не указан"}</small></div>
   <span className={"status "+o.status}>{o.status.replaceAll("_"," ")}</span>
   <button type="button" onClick={()=>setSelected(selected===o.id?null:o.id)} aria-expanded={selected===o.id}>Карточка</button>
   {selected===o.id&&<div className="canvaQueueDetail">
    <p>Категория: {canvaServices.find(s=>s.category===o.category)?.label||o.category}</p>
    <p>Приоритет: {o.priority} · SLA: {fmt(o.slaMinutes)} мин · Версия: {o.version??1}</p>
    <p>Исполнитель: {o.assigneeUserId||"Не назначен"}</p>
    <p>История: {o.history.length?o.history.join(" → "):"Событий пока нет"}</p>
    <small>Назначение, оплата и изменение статуса выполняются только через авторизованный серверный API.</small>
   </div>}
  </article>)}</div>
  {current&&<p className="canvaQueueFooter">Выбран заказ {current.id}. Режим просмотра без записи.</p>}
 </section>;
}
