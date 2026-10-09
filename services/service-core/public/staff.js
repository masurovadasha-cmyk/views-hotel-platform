import {createViewsClient} from "./views-client.js";
const token=document.querySelector("#token");
const tasksEl=document.querySelector("#tasks");
const message=document.querySelector("#message");
const client=createViewsClient({getToken:async()=>token.value.trim()});
const kinds={market_pick:"Собрать товары",market_deliver:"Доставить заказ",cleaning:"Уборка",laundry_pickup:"Забор белья",laundry_process:"Прачечная",laundry_return:"Возврат белья",concierge:"Консьерж"};
const labels={unassigned:"Не назначено",assigned:"Назначено",in_progress:"В работе",completed:"Завершено",cancelled:"Отменено"};
let loading=false;
async function refresh(){
 if(loading)return;
 loading=true;
 message.textContent="Загрузка...";
 try{
  const items=await client.listMyTasks();
  tasksEl.replaceChildren();
  if(!items.length)tasksEl.textContent="Нет назначенных заданий";
  for(const item of items){
   const card=document.createElement("article");
   card.className="task-card";
   const title=document.createElement("h3");
   title.className="task-title";
   title.textContent=kinds[item.task_kind]||item.task_kind;
   const meta=document.createElement("p");
   meta.className="task-meta";
   meta.textContent="Заказ "+item.order_id.slice(0,8)+" · Объект "+item.property_id.slice(0,8);
   const status=document.createElement("span");
   status.className="task-status";
   status.textContent=labels[item.status]||item.status;
   card.append(title,meta,status);
   if(item.due_at){
    const due=document.createElement("p");
    const late=new Date(item.due_at).getTime()<Date.now()&&!["completed","cancelled"].includes(item.status);
    due.className=late?"task-overdue":"task-meta";
    due.textContent="Срок: "+new Date(item.due_at).toLocaleString("ru-RU")+(late?" · Просрочено":"");
    card.append(due);
   }
   const actions=document.createElement("div");
   actions.className="task-actions";
   const act=(label,fn)=>{
    const button=document.createElement("button");
    button.type="button";
    button.textContent=label;
    button.onclick=async()=>{button.disabled=true;try{await fn()}catch(e){message.textContent="Ошибка: "+e.message}finally{button.disabled=false}};
    actions.append(button);
   };
   if(item.status==="assigned"){
    act("Начать",async()=>{await client.updateMyTask(item.id,"in_progress");await refresh()});
   }else if(item.status==="in_progress"&&item.task_kind==="cleaning"){
    act("Открыть чек-лист",async()=>{
     const checklist=await client.getCleaningChecklist(item.id);
     const section=document.createElement("section");
     section.className="task-checklist";
     section.replaceChildren();
     for(const line of checklist){
      const row=document.createElement("div");
      row.className="item";
      const label=document.createElement("span");
      label.textContent=(line.completed_at?"✓ ":"○ ")+line.label;
      row.append(label);
      if(!line.completed_at){
       const button=document.createElement("button");
       button.textContent="Выполнено";
       button.onclick=async()=>{button.disabled=true;try{await client.completeCleaningItem(item.id,line.item_code);message.textContent="Пункт подтверждён";await refresh()}catch(e){message.textContent=e.message;button.disabled=false}};
       row.append(button);
      }
      section.append(row);
     }
     if(checklist.length&&checklist.every(line=>line.completed_at)){
      const finish=document.createElement("button");
      finish.textContent="Завершить уборку";
      finish.onclick=async()=>{finish.disabled=true;try{await client.finalizeCleaning(item.id);await refresh()}catch(e){message.textContent=e.message;finish.disabled=false}};
      section.append(finish);
     }
     card.append(section);
    });
   }else if(item.status==="in_progress"&&!item.task_kind.startsWith("laundry_")){
    act("Завершить",async()=>{await client.updateMyTask(item.id,"completed");await refresh()});
   }
   if(actions.childNodes.length)card.append(actions);
   tasksEl.append(card);
  }
  message.textContent="Заданий: "+items.length;
 }catch(e){message.textContent="Ошибка: "+e.message}
 finally{loading=false}
}
document.querySelector("#connect").onclick=refresh;
document.querySelector("#refresh").onclick=refresh;
