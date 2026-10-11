import {useLegacyStaffLocale,legacyDate} from './LegacyStaffLocale';
import {FormEvent,useEffect,useState} from "react";
import type {LiveDamageReport,LiveInventoryItem,LiveLostFoundItem,LiveOperationsObservability,LiveShiftHandover} from "../../api/types";
import {api,ApiError} from "../../api/client";

function errorMessage(error:unknown){
  if(error instanceof ApiError)return error.body.error||error.message;
  return error instanceof Error?error.message:"Request failed";
}

function Panel({title,children}:{title:string;children:React.ReactNode}){
  const {t,locale}=useLegacyStaffLocale();
  return <section className="panel"><header><small>{t("VIEWS LIVE OPERATIONS")}</small><h2>{t(String(title))}</h2></header>{children}</section>;
}

export function OperationsOverviewLive(){
  const {t,locale}=useLegacyStaffLocale();
  const [summary,setSummary]=useState<{lostFoundOpen:number;damageOpen:number;inventoryLow:number;serviceOrdersOpen:number}|null>(null);
  const [observability,setObservability]=useState<LiveOperationsObservability|null>(null);
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  const [outboxMessage,setOutboxMessage]=useState<Record<string,number>|null>(null);

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
    setBusy(true);setOutboxMessage(null);
    try{
      const result=await api.processOutbox(50);
      setOutboxMessage({claimed:result.claimed,processed:result.processed,skipped:result.skippedClaim,retried:result.retried,failed:result.deadLettered,remaining:result.remaining});
      await load();
    }catch(e){setError(errorMessage(e))}
    finally{setBusy(false)}
  }

  return <div>
    {error&&<div className="notice">{t(String(error))}</div>}
    <section className="kpis">
      <article><span>{t("Open service orders")}</span><b>{summary?.serviceOrdersOpen??"—"}</b></article>
      <article><span>{t("Lost & Found")}</span><b>{summary?.lostFoundOpen??"—"}</b></article>
      <article><span>{t("Damage reports")}</span><b>{summary?.damageOpen??"—"}</b></article>
      <article><span>{t("Low stock")}</span><b>{summary?.inventoryLow??"—"}</b></article>
    </section>
    <section className="kpis">
      <article><span>{t("Outbox pending")}</span><b>{observability?.outboxPending??"—"}</b></article>
      <article><span>{t("Outbox retrying")}</span><b>{observability?.outboxRetrying??"—"}</b></article>
      <article><span>{t("Outbox leased")}</span><b>{observability?.outboxLeased??"—"}</b></article>
      <article><span>{t("Dead-letter")}</span><b>{observability?.outboxDeadLetter??"—"}</b></article>
    </section>
    <section className="kpis">
      <article><span>{t("Stale service work")}</span><b>{observability?.stale.serviceOrders??"—"}</b></article>
      <article><span>{t("Stale housekeeping")}</span><b>{observability?.stale.housekeeping??"—"}</b></article>
      <article><span>{t("Stale maintenance")}</span><b>{observability?.stale.maintenance??"—"}</b></article>
      <article><span>{t("Queue health")}</span><b>{observability?.outboxDeadLetter===0?t("OK"):t("ATTENTION")}</b></article>
      <article><span>{t("Processor")}</span><button className="primary" disabled={busy} onClick={processOutbox}>{busy?t("Processing…"):t("Process now")}</button></article>
    </section>
    {outboxMessage&&<div className="notice">{t("Claimed {claimed} · processed {processed} · skipped {skipped} · retried {retried} · failed {failed} · remaining {remaining}",outboxMessage)}</div>}
    <Panel title={t("Recent operational events")}>
      {!observability?.recentEvents.length?<div className="emptyLine">{t("No domain events recorded yet.")}</div>:
      <div className="compactRows">{observability.recentEvents.slice(0,12).map((event,index)=><div key={event.source+event.aggregate_id+event.created_at+index}>
        <span>{t(String(event.source))}</span>
        <b>{t(String(event.event_type))}</b>
        <small>{t(String(event.from_status??"—"))} → {t(String(event.to_status??"—"))} · {event.actor_user_id??t("system")}</small>
        <i>{legacyDate(event.created_at,locale)}</i>
      </div>)}</div>}
    </Panel>
    <Panel title={t("Operations control")}>
      <div className="notice">{t("All observability data is organization/property scoped. Raw event payloads are intentionally not exposed in this UI.")}</div>
    </Panel>
  </div>;
}

export function ExceptionsLive(){
  const {t,locale}=useLegacyStaffLocale();
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
    {error&&<div className="notice">{t(String(error))}</div>}
    <Panel title={t("Lost & Found")}>
      {lost.length===0?<div className="emptyLine">{t("No open lost-and-found records.")}</div>:<div className="orderList">{lost.map(item=><article className="order" key={item.id}>
        <div><b>{item.item_name}</b><span>{item.unit_code?t("Apartment {unit}",{unit:item.unit_code}):item.found_location||t("Property")} · {legacyDate(item.found_at,locale)}</span></div>
        <span className={"status "+item.status}>{t(String(item.status))}</span>
        <div className="orderActions">
          {item.status==="pending"&&<button disabled={busy!==""} onClick={()=>lostAction(item.id,"claim")}>{t("Claim")}</button>}
          {["pending","claimed"].includes(item.status)&&<button className="primary" disabled={busy!==""} onClick={()=>lostAction(item.id,"return")}>{t("Return")}</button>}
          {item.status==="returned"&&<button className="primary" disabled={busy!==""} onClick={()=>lostAction(item.id,"close")}>{t("Close")}</button>}
        </div>
      </article>)}</div>}
    </Panel>

    <Panel title={t("Damage reports")}>
      {damage.length===0?<div className="emptyLine">{t("No open damage reports.")}</div>:<div className="orderList">{damage.map(item=><article className="order" key={item.id}>
        <div><b>{item.title}</b><span>{item.unit_code?t("Apartment {unit}",{unit:item.unit_code}):t("Property")} · {t(String(item.severity))} {' '}{t("severity")}</span></div>
        <span className={"status "+item.status}>{t(String(item.status))}</span>
        <div className="orderActions">
          {item.status==="open"&&<button disabled={busy!==""} onClick={()=>damageAction(item.id,"review")}>{t("Review")}</button>}
          {["open","review"].includes(item.status)&&<button className="primary" disabled={busy!==""} onClick={()=>damageAction(item.id,"resolve")}>{t("Resolve")}</button>}
          {item.status==="resolved"&&<button className="primary" disabled={busy!==""} onClick={()=>damageAction(item.id,"close")}>{t("Close")}</button>}
        </div>
      </article>)}</div>}
    </Panel>

    <Panel title={t("Inventory below par")}>
      {stock.length===0?<div className="emptyLine">{t("All tracked inventory is at or above par.")}</div>:<div className="orderList">{stock.map(item=><article className="order" key={item.id}>
        <div><b>{item.name}</b><span>{item.quantity} / {item.par_level} {item.unit_of_measure}</span></div>
        <span className="status assigned">{t("reorder")}</span>
        <div className="orderActions"><button className="primary" disabled={busy!==""} onClick={()=>restock(item)}>{t("Restock to par")}</button></div>
      </article>)}</div>}
    </Panel>
  </div>;
}

export function ShiftHandoverLive(){
  const {t,locale}=useLegacyStaffLocale();
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
    {error&&<div className="notice">{t(String(error))}</div>}
    <Panel title={t("Create shift handover")}>
      <form className="hostForm" onSubmit={create}>
        <label>{t("From shift")}<input value={fromShift} onChange={e=>setFromShift(e.target.value)} required/></label>
        <label>{t("To shift")}<input value={toShift} onChange={e=>setToShift(e.target.value)} required/></label>
        <label>{t("Unresolved requests")}<textarea value={unresolved} onChange={e=>setUnresolved(e.target.value)} placeholder={t("One item per line")}/></label>
        <label>{t("Risks")}<textarea value={risks} onChange={e=>setRisks(e.target.value)} placeholder={t("One item per line")}/></label>
        <label>{t("Required follow-up")}<textarea value={followUp} onChange={e=>setFollowUp(e.target.value)} placeholder={t("One item per line")}/></label>
        <button className="primary" disabled={busy!==""}>{t("Create handover")}</button>
      </form>
    </Panel>

    <Panel title={t("Recent handovers")}>
      {items.length===0?<div className="emptyLine">{t("No shift handovers yet.")}</div>:<div className="orderList">{items.map(item=><article className="order" key={item.id}>
        <div>
          <b>{item.from_shift} → {item.to_shift}</b>
          <span>{legacyDate(item.created_at,locale)} · {item.acknowledged_at?t("acknowledged"):t("awaiting acknowledgement")}</span>
          <small>{t("Unresolved {count} · Risks {risks} · Follow-up {followup}",{count:item.unresolved.length,risks:item.risks.length,followup:item.followUp.length})}</small>
        </div>
        <span className={"status "+(item.acknowledged_at?"done":"assigned")}>{item.acknowledged_at?t("acknowledged"):t("open")}</span>
        <div className="orderActions">{!item.acknowledged_at&&<button className="primary" disabled={busy!==""} onClick={()=>acknowledge(item.id)}>{t("Acknowledge")}</button>}</div>
      </article>)}</div>}
    </Panel>

    {items[0]&&<Panel title={t("Latest handover detail")}>
      <div className="riskList">
        {items[0].unresolved.map((x,i)=><article key={"u"+i}><b>{t("Unresolved")}</b><span>{String(x)}</span></article>)}
        {items[0].risks.map((x,i)=><article className="dangerRow" key={"r"+i}><b>{t("Risk")}</b><span>{String(x)}</span></article>)}
        {items[0].followUp.map((x,i)=><article key={"f"+i}><b>{t("Follow-up")}</b><span>{String(x)}</span></article>)}
      </div>
    </Panel>}
  </div>;
}
