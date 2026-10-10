import {createViewsClient} from "./views-client.js";
import {mountViewsCalendar} from "./views-calendar.js";
const token=document.querySelector("#token"),booking=document.querySelector("#booking"),catalogEl=document.querySelector("#catalog"),totalEl=document.querySelector("#total"),message=document.querySelector("#message"),orderEl=document.querySelector("#order"),checkout=document.querySelector("#checkout"),refresh=document.querySelector("#refresh");
const loadCatalogButton=document.querySelector("#load-catalog"),loadBookingsButton=document.querySelector("#load-bookings");
const loadOrdersButton=document.querySelector("#load-orders"),historyEl=document.querySelector("#order-history");
const timelineEl=document.querySelector("#order-timeline");
const notificationsEl=document.querySelector("#notifications"),notificationsButton=document.querySelector("#load-notifications");
const eventLabels={"market.order.created":"Заказ оформлен","service.order.changed":"Статус заказа","service.task.assigned":"Назначен исполнитель","service.task.status_changed":"Выполнение задания","cleaning.task.completed":"Уборка завершена","laundry.bag.changed":"Прачечная"};
const client=createViewsClient({getToken:async()=>token.value.trim()});
const money=n=>Number(n).toLocaleString("ru-RU")+" UZS";
const guestDateSummary=document.querySelector("#guest-date-summary");
const guestCalendar=mountViewsCalendar(document.querySelector("#guest-calendar"),{
 onSave:({start,end,nights})=>{
  guestDateSummary.textContent=start+" — "+end+" · "+nights+" ночей (просмотр; не изменяет бронь)";
 },
 onClear:()=>{guestDateSummary.textContent="Предпросмотр сброшен; бронь не изменена"}
 }
});
document.querySelector("#guest-calendar-open").onclick=()=>guestCalendar.open();
const cart=new Map();
let catalog=[],orderId=null,pendingKey=null,pendingPayload=null,inFlight=false;
function render(){
 catalogEl.replaceChildren();
 for(const product of catalog){
  const row=document.createElement("div");row.className="item";
  const name=document.createElement("span");name.textContent=product.name+" · "+money(product.priceUzs);
  const controls=document.createElement("span");controls.className="actions";
  const minus=document.createElement("button"),plus=document.createElement("button"),count=document.createElement("output");
  minus.type=plus.type="button";
  minus.textContent="−";plus.textContent="+";
  minus.setAttribute("aria-label","Уменьшить количество: "+product.name);
  plus.setAttribute("aria-label","Увеличить количество: "+product.name);
  count.textContent=cart.get(product.sku)||0;
  minus.disabled=plus.disabled=!!pendingKey||!!orderId||inFlight;
  minus.onclick=()=>change(product.sku,-1);
  plus.onclick=()=>change(product.sku,1);
  controls.append(minus,count,plus);row.append(name,controls);catalogEl.append(row);
 }
 const subtotal=catalog.reduce((sum,p)=>sum+p.priceUzs*(cart.get(p.sku)||0),0);
 totalEl.textContent=money(subtotal+(subtotal?15000:0));
 checkout.disabled=!subtotal||!!orderId||inFlight;
 booking.disabled=!!pendingKey||!!orderId||inFlight;
 loadCatalogButton.disabled=loadBookingsButton.disabled=!!pendingKey||!!orderId||inFlight;
 loadOrdersButton.disabled=!!pendingKey||inFlight;
 token.disabled=!!pendingKey||!!orderId||inFlight;
}
function change(sku,delta){
 if(pendingKey||orderId||inFlight){message.textContent="Корзина заблокирована до завершения заказа";return}
 cart.set(sku,Math.max(0,Math.min(100,(cart.get(sku)||0)+delta)));render();
}
checkout.onclick=async()=>{
 if(orderId||inFlight)return;
 const items=[...cart].filter(([,quantity])=>quantity>0).map(([sku,quantity])=>({sku,quantity}));
 if(!items.length)return;
 if(!pendingKey){
  const bookingId=booking.value;
  if(!bookingId){message.textContent="Выберите активное проживание";return}
  pendingKey=crypto.randomUUID();
  pendingPayload={bookingId,items};
 }
 inFlight=true;render();
 let result;
 try{
  result=await client.createGuestOrder(pendingPayload.bookingId,pendingPayload.items,pendingKey);
 }catch(e){
  message.textContent="Ошибка создания: "+e.message+". Повторите с тем же ключом, не меняя корзину";
  inFlight=false;render();return;
 }
 orderId=result.id;
 pendingKey=null;pendingPayload=null;inFlight=false;
 refresh.disabled=false;
 message.textContent="Тестовый заказ сохранён";
 render();
 await updateOrder();
};
async function updateOrder(){
 if(!orderId)return;
 try{
  const o=await client.getOrder(orderId);
  orderEl.replaceChildren();
  for(const [key,value] of [["Заказ",o.id],["Статус",o.fulfillment_status],["Оплата",o.payment_status],["Сумма заказа",o.total_uzs==null?"Не рассчитана":money(o.total_uzs)]]){
   const p=document.createElement("p");p.textContent=key+": "+value;orderEl.append(p);
  }
 }catch(e){orderEl.textContent="Заказ создан. Статус временно недоступен: "+e.message}
 timelineEl.replaceChildren();
 try{
  const events=await client.getGuestOrderTimeline(orderId);
  if(!events.length){const li=document.createElement("li");li.textContent="Событий пока нет";timelineEl.append(li)}
  for(const event of events){
   const li=document.createElement("li");
   const detail=event.status||event.taskStatus||event.laundryStatus||event.taskKind||"";
   li.textContent=(eventLabels[event.type]||"Обновление")+(detail?" · "+detail:"")+" · "+new Date(event.at).toLocaleString("ru-RU");
   timelineEl.append(li);
  }
 }catch(e){const li=document.createElement("li");li.textContent="История выполнения временно недоступна";timelineEl.append(li)}
}
refresh.onclick=updateOrder;
async function loadGuestOrders(){
 if(pendingKey||inFlight){message.textContent="Дождитесь результата предыдущего заказа";return}
 loadOrdersButton.disabled=true;
 try{
  const orders=await client.listGuestOrders();
  historyEl.replaceChildren();
  if(!orders.length){historyEl.textContent="История заказов пока пуста";return}
  for(const o of orders){
   const button=document.createElement("button");
   button.type="button";button.className="order";
   button.textContent="Заказ "+o.id.slice(0,8)+" · "+o.fulfillment_status+" · "+(o.total_uzs==null?"Сумма неизвестна":money(o.total_uzs));
   button.onclick=async()=>{
    if(pendingKey||inFlight)return;
    orderId=o.id;
    timelineEl.replaceChildren();
    refresh.disabled=false;
    render();
    await updateOrder();
   };
   historyEl.append(button);
  }
 }catch(e){message.textContent="Не удалось загрузить историю: "+e.message}
 finally{render()}
}
loadOrdersButton.onclick=loadGuestOrders;
async function loadNotifications(){
 notificationsButton.disabled=true;
 try{
  const items=await client.listGuestNotifications();
  notificationsEl.replaceChildren();
  if(!items.length){notificationsEl.textContent="Новых уведомлений нет";return}
  for(const item of items){
   const row=document.createElement("div");row.className="item";
   const description=document.createElement("span");
   description.textContent=item.message+" · "+new Date(item.occurred_at).toLocaleString("ru-RU")+(item.read_at?" · Прочитано":" · Новое");
   row.append(description);
   if(!item.read_at){
    const button=document.createElement("button");button.type="button";button.textContent="Прочитано";
    button.onclick=async()=>{
     button.disabled=true;
     try{await client.markGuestNotificationRead(item.id);await loadNotifications()}
     catch(e){message.textContent="Ошибка уведомления: "+e.message;button.disabled=false}
    };
    row.append(button);
   }
   notificationsEl.append(row);
  }
 }catch(e){message.textContent="Не удалось загрузить уведомления: "+e.message}
 finally{notificationsButton.disabled=false}
}
notificationsButton.onclick=loadNotifications;

token.addEventListener("input",()=>{
 if(pendingKey||orderId||inFlight)return;
 catalog=[];cart.clear();booking.replaceChildren();
 const option=document.createElement("option");option.value="";option.textContent="Сначала загрузите бронирования";booking.append(option);
 historyEl.replaceChildren();timelineEl.replaceChildren();notificationsEl.replaceChildren();orderEl.textContent="Выберите товары и создайте заказ";render();
});

loadCatalogButton.onclick=async()=>{
 if(pendingKey||orderId||inFlight)return;
 try{
  const next=await client.listCatalog();
  if(pendingKey||orderId||inFlight)return;
  catalog=next;cart.clear();message.textContent="Каталог загружен: "+catalog.length+" позиций";render();
 }catch(e){message.textContent="Не удалось загрузить каталог: "+e.message}
};
loadBookingsButton.onclick=async()=>{
 if(pendingKey||orderId||inFlight)return;
 try{
  const bookings=await client.listBookings();
  if(pendingKey||orderId||inFlight)return;
  booking.replaceChildren();
  for(const b of bookings){
   const option=document.createElement("option");option.value=b.id;
   option.textContent="Объект "+b.property_id.slice(0,8)+" · до "+new Date(b.ends_at).toLocaleDateString("ru-RU");
   booking.append(option);
  }
  booking.onchange=()=>{
   const current=bookings.find(b=>b.id===booking.value);
   if(!current)return;
   const start=current.starts_at.slice(0,10),end=current.ends_at.slice(0,10);
   guestCalendar.setRange(start,end);
   guestDateSummary.textContent=start+" — "+end+" (подтверждённое проживание)";
  };
  if(bookings.length){
   const current=bookings[0];
   const checkin=current.starts_at.slice(0,10),checkout=current.ends_at.slice(0,10);
   guestCalendar.setRange(checkin,checkout);
   guestDateSummary.textContent=checkin+" — "+checkout+" (подтверждённое проживание)";
  }
  if(!bookings.length)message.textContent="Нет активных заселений";
 }catch(e){message.textContent="Ошибка бронирований: "+e.message}
};
render();
