import {describe,it,expect} from "vitest";
import {assignMarketTask,appendMarketTaskEvent,validMarketTasks} from "./marketTasks";
import {marketSeed,placeDemoOrder,type MarketState} from "./marketModel";
function order(){
 const state:MarketState={products:marketSeed.map(p=>({...p})),orders:[],ledger:[]};
 return placeDemoOrder(state,{[state.products[0].id]:1},{idempotencyKey:"test",apartment:"#235",deliverySlot:"now",comment:"",payment:"demo_card",now:"2026-10-09T10:00:00Z",orderId:"VM-TEST"}).state;
}
describe("market staff task demo",()=>{
 it("assigns owner and SLA without mutating order",()=>{
  const state=order(),snapshot=JSON.stringify(state);
  const tasks=assignMarketTask({},state.orders[0],"Courier","high","2026-10-09T12:00:00Z","2026-10-09T11:00:00Z");
  expect(tasks["VM-TEST"].assignee).toBe("Courier");
  expect(validMarketTasks(tasks,state)).toBe(true);
  expect(JSON.stringify(state)).toBe(snapshot);
 });
 it("rejects expired deadline and invalid staff name",()=>{
  const o=order().orders[0];
  expect(()=>assignMarketTask({},o,"X","normal","2026-10-09T12:00:00Z","2026-10-09T11:00:00Z")).toThrow("INVALID_ASSIGNMENT");
  expect(()=>assignMarketTask({},o,"Courier","normal","2026-10-09T10:00:00Z","2026-10-09T11:00:00Z")).toThrow("INVALID_DEADLINE");
 });
 it("appends task activity immutably",()=>{
  const state=order(),a=assignMarketTask({},state.orders[0],"Courier","urgent","2026-10-09T12:00:00Z","2026-10-09T11:00:00Z");
  const b=appendMarketTaskEvent(a,"VM-TEST","Сборка","2026-10-09T11:10:00Z");
  expect(a["VM-TEST"].events).toHaveLength(1);
  expect(b["VM-TEST"].events).toHaveLength(2);
 });
 it("refuses orphaned tasks",()=>{
  expect(validMarketTasks({missing:{orderId:"missing",assignee:"Courier",priority:"high",dueAt:"2026-10-09T12:00:00Z",events:[]}},order())).toBe(false);
 });
});
