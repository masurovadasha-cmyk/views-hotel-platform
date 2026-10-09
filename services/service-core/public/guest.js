import {createViewsClient} from "./views-client.js";
const token=document.querySelector("#token"),booking=document.querySelector("#booking"),catalogEl=document.querySelector("#catalog"),totalEl=document.querySelector("#total"),message=document.querySelector("#message"),orderEl=document.querySelector("#order"),checkout=document.querySelector("#checkout"),refresh=document.querySelector("#refresh");
const loadCatalogButton=document.querySelector("#load-catalog"),loadBookingsButton=document.querySelector("#load-bookings");
const client=createViewsClient({getToken:async()=>token.value.trim()});
const money=n=>Number(n).toLocaleString("ru-RU")+" UZS";
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
}
refresh.onclick=updateOrder;
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
  if(!bookings.length)message.textContent="Нет активных заселений";
 }catch(e){message.textContent="Ошибка бронирований: "+e.message}
};
render();
