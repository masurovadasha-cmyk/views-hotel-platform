import {useEffect,useRef,useState} from "react";
import {fetchStaffOrderDetail,StaffGatewayError,type StaffOrderDetail} from "../../domain/marketStaffGateway";

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function ServerOrderInspector(){
 const [propertyId,setPropertyId]=useState("utower");
 const [orderId,setOrderId]=useState("");
 const [detail,setDetail]=useState<StaffOrderDetail|null>(null);
 const [error,setError]=useState("");
 const [loading,setLoading]=useState(false);
 const active=useRef<AbortController|null>(null);
 useEffect(()=>()=>active.current?.abort(),[]);
 async function inspect(){
  active.current?.abort();
  const controller=new AbortController();active.current=controller;
  setDetail(null);setError("");setLoading(true);
  try{
   const result=await fetchStaffOrderDetail(propertyId.trim(),orderId.trim(),{
    gatewayEnabled:true,fetcher:fetch,signal:controller.signal
   });
   if(active.current===controller)setDetail(result);
  }catch(cause){
   if(active.current!==controller||controller.signal.aborted)return;
   const status=cause instanceof StaffGatewayError?cause.status:0;
   setError(status===401||status===403?"Требуется действующая сессия сотрудника с доступом к объекту."
    :status===404?"Заказ не найден.":status===400?"Проверьте объект и UUID заказа."
    :status===503?"Серверный шлюз пока не настроен.":"Не удалось загрузить серверный заказ.");
  }finally{if(active.current===controller)setLoading(false)}
 }
 return <section className="marketPanel marketServerInspector" aria-label="Серверный заказ Staff CRM">
  <header><small>SERVER · STAFF CRM</small><h2>Карточка заказа Core</h2></header>
  <p>Только просмотр через авторизованный серверный шлюз. Локальные демозаказы и склад не изменяются.</p>
  <div className="marketTaskFields">
   <label>Объект<input value={propertyId} maxLength={80} onChange={e=>setPropertyId(e.target.value)}/></label>
   <label>UUID заказа<input value={orderId} onChange={e=>setOrderId(e.target.value)} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"/></label>
   <button disabled={loading||!UUID.test(orderId)} onClick={inspect}>{loading?"Загрузка…":"Загрузить заказ"}</button>
  </div>
  {error&&<p role="alert">{error}</p>}
  {detail&&<article>
   <h3>{detail.order.id}</h3>
   <p>Статус: {detail.order.status} · Оплата: {detail.order.payment_status}</p>
   <p>Сумма: {detail.order.total_minor} UZS · Версия: {detail.order.version}</p>
   <p>Исполнитель: {detail.assignment?.assignee_membership_id||"Не назначен"}</p>
   {detail.assignment&&<p>SLA: {new Date(detail.assignment.due_at).toLocaleString("ru-RU")}</p>}
   <h4>Товары</h4>
   <ul>{detail.lines.map(l=><li key={l.sku}>{l.product_name_snapshot} × {l.quantity} — {l.line_total_minor} UZS</li>)}</ul>
   <h4>История</h4>
   <ol>{detail.events.map(e=><li key={String(e.id)}>{e.action} · {new Date(e.created_at).toLocaleString("ru-RU")}</li>)}</ol>
  </article>}
 </section>;
}
