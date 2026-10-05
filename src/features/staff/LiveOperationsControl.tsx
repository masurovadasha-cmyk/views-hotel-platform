import {FormEvent,useEffect,useState} from "react";
import type {LiveDamageReport,LiveInventoryItem,LiveLostFoundItem,LiveOperationsObservability,LiveShiftHandover} from "../../api/types";
import {api,ApiError} from "../../api/client";

function errorMessage(error:unknown){
  if(error instanceof ApiError)return error.body.error||error.message;
  return error instanceof Error?error.message:"Request failed";
}

function Panel({title,children}:{title:string;children:React.ReactNode}){
  return <section className="panel"><header><small>VIEWS LIVE OPERATIONS</small><h2>{title}</h2></header>{children}</section>;
}

export function OperationsOverviewLive(){
  const [summary,setSummary]=useState<{lostFoundOpen:number;damageOpen:number;inventoryLow:number;serviceOrdersOpen:number}|null>(null);
  const [observability,setObservability]=useState<LiveOperationsObservability|null>(null);
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  const [outboxMessage,setOutboxMessage]=useState("");

  async function load(){
    try{
      const [summaryResult,observabilityResult]=await Promise.all([
        api.operationsSummary("utower"),api.operationsObservability("utower")
      ]);
      setSummary(summaryResult);
      setObservability(observabilityResult);
      setError("");
    }catch(e){setError(errorMessage(e))}
  }

  useEffect(()=>{void load()},[]);

  async function processOutbox(){
    setBusy(true);setOutboxMessage("");
    try{
      const result=await api.processOutbox(50);
      setOutboxMessage("Claimed "+result.claimed+" · processed "+result.processed+" · skipped "+result.skippedClaim+" · retried "+result.retried+" · dead-letter "+result.deadLettered+" · remaining "+result.remaining);
      await load();
    }catch(e){setError(errorMessage(e))}
    finally{setBusy(false)}
  }

  return <div>
    {error&&<div className="notice">{error}</div>}
    <section className="kpis">
      <article><span>Open service orders</span><b>{summary?.serviceOrdersOpen??"—"}</b></article>
      <article><span>Lost & Found</span><b>{summary?.lostFoundOpen??"—"}</b></article>
      <article><span>Damage reports</span><b>{summary?.damageOpen??"—"}</b></article>
      <article><span>Low stock</span><b>{summary?.inventoryLow??"—"}</b></article>
    </section>
    <section className="kpis">
      <article><span>Outbox pending</span><b>{observability?.outboxPending??"—"}</b></article>
      <article><span>Outbox retrying</span><b>{observability?.outboxRetrying??"—"}</b></article>
      <article><span>Outbox leased</span><b>{observability?.outboxLeased??"—"}</b></article>
      <article><span>Dead-letter</span><b>{observability?.outboxDeadLetter??"—"}</b></article>
    </section>
    <section className="kpis">
      <article><span>Stale service work</span><b>{observability?.stale.serviceOrders??"—"}</b></article>
      <article><span>Stale housekeeping</span><b>{observability?.stale.housekeeping??"—"}</b></article>
      <article><span>Stale maintenance</span><b>{observability?.stale.maintenance??"—"}</b></article>
      <article><span>Queue health</span><b>{observability?.outboxDeadLetter===0?"OK":"ATTENTION"}</b></article>
      <article><span>Processor</span><button className="primary" disabled={busy} onClick={processOutbox}>{busy?"Processing…":"Process now"}</button></article>
    </section>
    {outboxMessage&&<div className="notice">{outboxMessage}</div>}
    <Panel title="Recent operational events">
      {!observability?.recentEvents.length?<div className="emptyLine">No domain events recorded yet.</div>:
      <div className="compactRows">{observability.recentEvents.slice(0,12).map((event,index)=><div key={event.source+event.aggregate_id+event.created_at+index}>
        <span>{event.source}</span>
        <b>{event.event_type}</b>
        <small>{event.from_status??"—"} → {event.to_status??"—"} · {event.actor_user_id??"system"}</small>
        <i>{event.created_at}</i>
      </div>)}</div>}
    </Panel>
    <Panel title="Operations control">
      <div className="notice">All observability data is organization/property scoped. Raw event payloads are intentionally not exposed in this UI.</div>
    </Panel>
  </div>;
}

export function ExceptionsLive(){
  const [lost,setLost]=useState<LiveLostFoundItem[]>([]);
  const [damage,setDamage]=useState<LiveDamageReport[]>([]);
  const [stock,setStock]=useState<LiveInventoryItem[]>([]);
  const [error,setError]=useState("");
  const [busy,setBusy]=useState("");

  async function load(){
    try{
      const result=await api.operationsExceptions("utower");
      setLost(result.lostFound);
      setDamage(result.damage);
      setStock(result.lowStock);
      setError("");
    }catch(e){setError(errorMessage(e))}
  }
  useEffect(()=>{void load()},[]);

  async function lostAction(id:string,action:"claim"|"return"|"close"){
    setBusy(id+action);
    try{await api.lostFoundAction(id,action);await load()}catch(e){setError(errorMessage(e))}finally{setBusy("")}
  }
  async function damageAction(id:string,action:"review"|"resolve"|"close"){
    setBusy(id+action);
    try{await api.damageAction(id,action);await load()}catch(e){setError(errorMessage(e))}finally{setBusy("")}
  }
  async function restock(item:LiveInventoryItem){
    const delta=Math.max(0,Number(item.par_level)-Number(item.quantity));
    if(!delta)return;
    setBusy(item.id+"restock");
    try{await api.inventoryAdjust(item.id,delta,"Restock to par from Operations Control");await load()}catch(e){setError(errorMessage(e))}finally{setBusy("")}
  }

  return <div className="exceptionsGrid">
    {error&&<div className="notice">{error}</div>}
    <Panel title="Lost & Found">
      {lost.length===0?<div className="emptyLine">No open lost-and-found records.</div>:<div className="orderList">{lost.map(item=><article className="order" key={item.id}>
        <div><b>{item.item_name}</b><span>{item.unit_code?"Apt "+item.unit_code:item.found_location||"Property"} · {item.found_at}</span></div>
        <span className={"status "+item.status}>{item.status}</span>
        <div className="orderActions">
          {item.status==="pending"&&<button disabled={busy!==""} onClick={()=>lostAction(item.id,"claim")}>Claim</button>}
          {["pending","claimed"].includes(item.status)&&<button className="primary" disabled={busy!==""} onClick={()=>lostAction(item.id,"return")}>Return</button>}
          {item.status==="returned"&&<button className="primary" disabled={busy!==""} onClick={()=>lostAction(item.id,"close")}>Close</button>}
        </div>
      </article>)}</div>}
    </Panel>

    <Panel title="Damage reports">
      {damage.length===0?<div className="emptyLine">No open damage reports.</div>:<div className="orderList">{damage.map(item=><article className="order" key={item.id}>
        <div><b>{item.title}</b><span>{item.unit_code?"Apt "+item.unit_code:"Property"} · {item.severity} severity</span></div>
        <span className={"status "+item.status}>{item.status}</span>
        <div className="orderActions">
          {item.status==="open"&&<button disabled={busy!==""} onClick={()=>damageAction(item.id,"review")}>Review</button>}
          {["open","review"].includes(item.status)&&<button className="primary" disabled={busy!==""} onClick={()=>damageAction(item.id,"resolve")}>Resolve</button>}
          {item.status==="resolved"&&<button className="primary" disabled={busy!==""} onClick={()=>damageAction(item.id,"close")}>Close</button>}
        </div>
      </article>)}</div>}
    </Panel>

    <Panel title="Inventory below par">
      {stock.length===0?<div className="emptyLine">All tracked inventory is at or above par.</div>:<div className="orderList">{stock.map(item=><article className="order" key={item.id}>
        <div><b>{item.name}</b><span>{item.quantity} / {item.par_level} {item.unit_of_measure}</span></div>
        <span className="status assigned">reorder</span>
        <div className="orderActions"><button className="primary" disabled={busy!==""} onClick={()=>restock(item)}>Restock to par</button></div>
      </article>)}</div>}
    </Panel>
  </div>;
}

export function ShiftHandoverLive(){
  const [items,setItems]=useState<LiveShiftHandover[]>([]);
  const [error,setError]=useState("");
  const [busy,setBusy]=useState("");
  const [fromShift,setFromShift]=useState("current");
  const [toShift,setToShift]=useState("next");
  const [unresolved,setUnresolved]=useState("");
  const [risks,setRisks]=useState("");
  const [followUp,setFollowUp]=useState("");

  async function load(){
    try{
      const result=await api.handovers("utower");
      setItems(result.items);
      setError("");
    }catch(e){setError(errorMessage(e))}
  }
  useEffect(()=>{void load()},[]);

  const lines=(value:string)=>value.split("\n").map(x=>x.trim()).filter(Boolean).slice(0,100);

  async function create(e:FormEvent){
    e.preventDefault();
    setBusy("create");
    try{
      await api.createHandover({
        propertyId:"utower",fromShift,toShift,
        unresolved:lines(unresolved),risks:lines(risks),followUp:lines(followUp)
      });
      setUnresolved("");setRisks("");setFollowUp("");
      await load();
    }catch(err){setError(errorMessage(err))}
    finally{setBusy("")}
  }

  async function acknowledge(id:string){
    setBusy(id);
    try{await api.acknowledgeHandover(id);await load()}catch(e){setError(errorMessage(e))}finally{setBusy("")}
  }

  return <div className="handoverGrid">
    {error&&<div className="notice">{error}</div>}
    <Panel title="Create shift handover">
      <form className="hostForm" onSubmit={create}>
        <label>From shift<input value={fromShift} onChange={e=>setFromShift(e.target.value)} required/></label>
        <label>To shift<input value={toShift} onChange={e=>setToShift(e.target.value)} required/></label>
        <label>Unresolved requests<textarea value={unresolved} onChange={e=>setUnresolved(e.target.value)} placeholder="One item per line"/></label>
        <label>Risks<textarea value={risks} onChange={e=>setRisks(e.target.value)} placeholder="One item per line"/></label>
        <label>Required follow-up<textarea value={followUp} onChange={e=>setFollowUp(e.target.value)} placeholder="One item per line"/></label>
        <button className="primary" disabled={busy!==""}>Create handover</button>
      </form>
    </Panel>

    <Panel title="Recent handovers">
      {items.length===0?<div className="emptyLine">No shift handovers yet.</div>:<div className="orderList">{items.map(item=><article className="order" key={item.id}>
        <div>
          <b>{item.from_shift} → {item.to_shift}</b>
          <span>{item.created_at} · {item.acknowledged_at?"acknowledged":"awaiting acknowledgement"}</span>
          <small>{"Unresolved "+item.unresolved.length+" · Risks "+item.risks.length+" · Follow-up "+item.followUp.length}</small>
        </div>
        <span className={"status "+(item.acknowledged_at?"done":"assigned")}>{item.acknowledged_at?"acknowledged":"open"}</span>
        <div className="orderActions">{!item.acknowledged_at&&<button className="primary" disabled={busy!==""} onClick={()=>acknowledge(item.id)}>Acknowledge</button>}</div>
      </article>)}</div>}
    </Panel>

    {items[0]&&<Panel title="Latest handover detail">
      <div className="riskList">
        {items[0].unresolved.map((x,i)=><article key={"u"+i}><b>Unresolved</b><span>{String(x)}</span></article>)}
        {items[0].risks.map((x,i)=><article className="dangerRow" key={"r"+i}><b>Risk</b><span>{String(x)}</span></article>)}
        {items[0].followUp.map((x,i)=><article key={"f"+i}><b>Follow-up</b><span>{String(x)}</span></article>)}
      </div>
    </Panel>}
  </div>;
}
