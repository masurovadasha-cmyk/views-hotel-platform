import {createViewsClient} from "./views-client.js";
const token=document.querySelector("#token"),message=document.querySelector("#message");
const client=createViewsClient({getToken:async()=>token.value.trim()});
const fmt=n=>Number(n).toLocaleString("ru-RU")+" UZS";
function render(target,items,fields){
 const root=document.querySelector(target);root.replaceChildren();
 if(!items.length){root.textContent="Нет записей";return}
 for(const item of items){const row=document.createElement("div");row.className="order";
  for(const [label,key] of fields){const p=document.createElement("p");p.textContent=label+": "+(key==="amount_uzs"?fmt(item[key]):item[key]??"—");row.append(p)}
  root.append(row)}
}
document.querySelector("#load").onclick=async()=>{
 message.textContent="Загрузка...";
 try{
  const [payments,refunds]=await Promise.all([client.listPayments(),client.listRefunds()]);
  render("#payments",payments,[["Заказ","order_id"],["Провайдер","provider"],["Сумма","amount_uzs"],["Статус","status"]]);
  render("#refunds",refunds,[["Платёж","intent_id"],["Сумма","amount_uzs"],["Статус","status"],["Причина","reason"]]);
  message.textContent="Данные загружены";
 }catch(e){message.textContent="Ошибка доступа или загрузки: "+e.message}
};
