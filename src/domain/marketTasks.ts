import type {MarketOrder,MarketState} from "./marketModel";

export type MarketPriority="normal"|"high"|"urgent";
export interface MarketTaskEvent{at:string;actor:string;action:string;detail:string}
export interface MarketTask{orderId:string;assignee:string;priority:MarketPriority;dueAt:string;events:MarketTaskEvent[]}
export type MarketTaskMap=Record<string,MarketTask>;
const priorities:MarketPriority[]=["normal","high","urgent"];
export function assignMarketTask(tasks:MarketTaskMap,order:MarketOrder,assignee:string,priority:MarketPriority,dueAt:string,now:string):MarketTaskMap{
  if(order.status==="cancelled"||order.status==="delivered")throw Error("ORDER_CLOSED");
  if(assignee.trim().length<2||assignee.trim().length>80||!priorities.includes(priority))throw Error("INVALID_ASSIGNMENT");
  const deadline=Date.parse(dueAt),start=Date.parse(now);
  if(!Number.isFinite(deadline)||!Number.isFinite(start)||deadline<=start)throw Error("INVALID_DEADLINE");
  const old=tasks[order.id];
  const events=[...(old?.events||[]),{at:now,actor:"Диспетчер (демо)",action:"Назначение",detail:assignee.trim()+" · "+priority}];
  return {...tasks,[order.id]:{orderId:order.id,assignee:assignee.trim(),priority,dueAt,events}};
}
export function appendMarketTaskEvent(tasks:MarketTaskMap,orderId:string,action:string,now:string):MarketTaskMap{
  const task=tasks[orderId];if(!task)return tasks;
  return {...tasks,[orderId]:{...task,events:[...task.events,{at:now,actor:"Сотрудник (демо)",action,detail:"Изменение статуса"}]}};
}
export function validMarketTasks(value:unknown,state:MarketState):value is MarketTaskMap{
  if(!value||typeof value!=="object"||Array.isArray(value))return false;
  const orders=new Map(state.orders.map(o=>[o.id,o]));
  return Object.entries(value).every(([id,item])=>{
    if(!item||typeof item!=="object")return false;
    const t=item as MarketTask;
    return !!orders.get(id)&&t.orderId===id&&typeof t.assignee==="string"&&t.assignee.length>=2&&priorities.includes(t.priority)&&Number.isFinite(Date.parse(t.dueAt))&&Array.isArray(t.events)&&t.events.every(e=>e&&typeof e.at==="string"&&typeof e.actor==="string"&&typeof e.action==="string"&&typeof e.detail==="string");
  });
}
