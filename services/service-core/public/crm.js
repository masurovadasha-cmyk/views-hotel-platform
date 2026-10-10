import {createViewsClient} from "./views-client.js";
import {mountViewsCalendar} from "./views-calendar.js";
const token=document.querySelector("#token"),message=document.querySelector("#message"),orders=document.querySelector("#orders"),details=document.querySelector("#details"),actions=document.querySelector("#actions");
const client=createViewsClient({getToken:async()=>token.value.trim()});
let dateFilter=null;
let lastOrders=[];
let lastBookings=[];
const crmCalendar=mountViewsCalendar(document.querySelector("#crm-calendar"),{
 onSave:({start,end,nights})=>{
  dateFilter={start,end};
  document.querySelector("#crm-date-summary").textContent=start+" — "+end+" · "+nights+" ночей";
  renderOrders(lastOrders);
  renderBookings(lastBookings);
 }
});
document.querySelector("#crm-calendar-open").onclick=()=>crmCalendar.open();
function renderBookings(list){
 const root=document.querySelector("#crm-bookings");root.replaceChildren();
 const filtered=dateFilter?list.filter(b=>(b.starts_at||"").slice(0,10)<dateFilter.end&&(b.ends_at||"").slice(0,10)>dateFilter.start):list;
 for(const booking of filtered){
  const item=document.createElement("p");item.className="order";
  item.textContent="Бронь "+booking.id.slice(0,8)+" · Объект "+booking.property_id.slice(0,8)+" · "+booking.starts_at.slice(0,10)+" — "+booking.ends_at.slice(0,10)+" · "+booking.status;
  root.append(item);
 }
 if(!filtered.length)root.textContent="Бронирований в этом периоде нет";
}
function renderOrders(list){
 orders.replaceChildren();
 const filtered=dateFilter?list.filter(order=>{const day=(order.created_at||"").slice(0,10);return day>=dateFilter.start&&day<dateFilter.end}):list;
 for(const order of filtered){
  const button=document.createElement("button");button.className="order";
  button.textContent=order.id.slice(0,8)+" · "+(labels[order.fulfillment_status]||order.fulfillment_status);
  button.onclick=()=>selectOrder(order.id).catch(e=>message.textContent=e.message);
  orders.append(button);
 }
 if(!filtered.length)orders.textContent="Заказов за выбранный период нет";
}
const transitions={draft:["awaiting_payment","cancelled"],awaiting_payment:["confirmed","cancelled"],confirmed:["assigned","cancelled"],assigned:["in_progress","cancelled"],in_progress:["completed","cancelled"]};
const labels={draft:"Создан",awaiting_payment:"Ожидает оплату",confirmed:"Подтверждён",assigned:"Назначен",in_progress:"В работе",completed:"Завершён",cancelled:"Отменён"};
async function selectOrder(id){const order=await client.getOrder(id);details.replaceChildren();actions.replaceChildren();const fields=[["Заказ",order.id],["Объект",order.property_id],["Услуга",order.service_type],["Статус",labels[order.fulfillment_status]||order.fulfillment_status],["Оплата",order.payment_status]];for(const [key,value] of fields){const p=document.createElement("p");p.textContent=key+": "+value;details.append(p)}for(const next of transitions[order.fulfillment_status]||[]){const button=document.createElement("button");button.textContent=labels[next];button.onclick=async()=>{button.disabled=true;try{await client.changeStatus(id,next);message.textContent="Статус обновлён";await load();await selectOrder(id)}catch(e){message.textContent="Ошибка: "+e.message}finally{button.disabled=false}};actions.append(button,document.createTextNode(" "))}}
async function load(){message.textContent="Загрузка...";try{const [list,sla,bookings]=await Promise.all([client.listOrders(),client.getDispatchSla(),client.listCrmBookings()]);document.querySelector("#sla").textContent="Всего: "+sla.total+" · Открыто: "+sla.open+" · Просрочено: "+sla.overdue+" · Завершено: "+sla.completed;lastOrders=list;renderOrders(list);lastBookings=bookings;renderBookings(bookings);message.textContent="Загружено заказов: "+list.length}catch(e){message.textContent="Ошибка: "+e.message}}
document.querySelector("#connect").onclick=load;
document.querySelector("#refresh").onclick=load;
