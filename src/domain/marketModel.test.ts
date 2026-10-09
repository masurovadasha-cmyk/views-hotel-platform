import {describe,expect,it} from "vitest";
import {addCartLine,advanceMarketOrder,cancelMarketOrder,marketSeed,placeDemoOrder,priceWithMarkup,type MarketState} from "./marketModel";

function state():MarketState{return {products:marketSeed.map(p=>({...p})),orders:[],ledger:[]}}

describe("V-Market demo core",()=>{
  it("seeds at least 120 SKUs",()=>expect(marketSeed.length).toBeGreaterThanOrEqual(120));
  it("applies 25 percent markup with UZS rounding",()=>expect(priceWithMarkup(10000,25)).toBe(12500));
  it("caps cart quantity at available stock",()=>{
    const p={...marketSeed[0],stock:3,reserved:1};
    expect(addCartLine({},p,99)[p.id]).toBe(2);
  });
  it("reserves stock and is idempotent",()=>{
    const s=state(); const p=s.products[0]; const cart={[p.id]:2};
    const first=placeDemoOrder(s,cart,{idempotencyKey:"k1",apartment:"#235",deliverySlot:"now",comment:"",payment:"demo_card",paymentOutcome:"success",now:"2026-10-09T10:00:00Z",orderId:"VM-TEST"});
    expect(first.state.products[0].reserved).toBe(p.reserved+2);
    const second=placeDemoOrder(first.state,cart,{idempotencyKey:"k1",apartment:"#235",deliverySlot:"now",comment:"",payment:"demo_card"});
    expect(second.duplicate).toBe(true);expect(second.state.orders).toHaveLength(1);
  });
  it("delivery consumes reserved stock exactly once",()=>{
    const s=state(); const p=s.products[0]; const cart={[p.id]:2};
    let next=placeDemoOrder(s,cart,{idempotencyKey:"k2",apartment:"#235",deliverySlot:"now",comment:"",payment:"room_charge",now:"2026-10-09T10:00:00Z",orderId:"VM-D"}).state;
    for(let i=0;i<4;i++)next=advanceMarketOrder(next,"VM-D","2026-10-09T11:00:00Z");
    expect(next.orders[0].status).toBe("delivered");
    expect(next.products[0].stock).toBe(p.stock-2);
    expect(next.products[0].reserved).toBe(p.reserved);
    expect(next.ledger.filter(x=>x.type==="SALE")).toHaveLength(1);
  });
  it("cancellation releases reservation",()=>{
    const s=state(); const p=s.products[0]; const cart={[p.id]:1};
    const placed=placeDemoOrder(s,cart,{idempotencyKey:"k3",apartment:"#235",deliverySlot:"now",comment:"",payment:"demo_card",paymentOutcome:"success",orderId:"VM-C"}).state;
    const cancelled=cancelMarketOrder(placed,"VM-C");
    expect(cancelled.products[0].reserved).toBe(p.reserved);
    expect(cancelled.orders[0].status).toBe("cancelled");
  });
  it("failed demo payment never creates an order",()=>{
    const s=state(); const p=s.products[0];
    expect(()=>placeDemoOrder(s,{[p.id]:1},{idempotencyKey:"k4",apartment:"#235",deliverySlot:"now",comment:"",payment:"demo_card",paymentOutcome:"failure"})).toThrow("DEMO_PAYMENT_FAILED");
    expect(s.orders).toHaveLength(0);
  });
});
