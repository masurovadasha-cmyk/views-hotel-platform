import {useLegacyStaffLocale,legacyDate} from './LegacyStaffLocale';
import {useEffect,useMemo,useState} from "react";
import type {HospitalityRole,ServiceCategory} from "../../domain/types";
import type {LiveIntegrationStatus,LiveServiceOrder,LiveStaffWorkload,LiveTeamSummary} from "../../api/types";
import {api,ApiError} from "../../api/client";

function errorMessage(error:unknown){
  if(error instanceof ApiError)return error.body.error||error.message;
  return error instanceof Error?error.message:"Request failed";
}

function Panel({title,children}:{title:string;children:React.ReactNode}){
  const {t,locale}=useLegacyStaffLocale();
  return <section className="panel"><header><small>{t("VIEWS LIVE CONTROL")}</small><h2>{t(String(title))}</h2></header>{children}</section>;
}

const assigneeCategories:Record<string,ServiceCategory[]>={
  cleaner:["cleaning"],
  housekeeping_supervisor:["cleaning"],
  concierge:["concierge","laundry","minimart","restaurant","bar","rent_car","spa"],
  technician:["maintenance"],
  maintenance_manager:["maintenance"],
  front_desk:["reservation_front_desk","concierge"],
  reservation_manager:["reservation_front_desk"]
};

function canTake(role:string,category:string){
  return (assigneeCategories[role]||[]).includes(category as ServiceCategory);
}

export function TeamWorkloadLive({role}:{role:HospitalityRole}){
  const {t,locale}=useLegacyStaffLocale();
  const [staff,setStaff]=useState<LiveStaffWorkload[]>([]);
  const [summary,setSummary]=useState<LiveTeamSummary|null>(null);
  const [orders,setOrders]=useState<LiveServiceOrder[]>([]);
  const [selected,setSelected]=useState<Record<string,string>>({});
  const [busy,setBusy]=useState("");
  const [error,setError]=useState("");

  async function load(){
    try{
      const [team,queue]=await Promise.all([api.teamWorkload("utower"),api.serviceOrders("utower")]);
      setStaff(team.staff);
      setSummary(team.summary);
      setOrders(queue.items.filter(item=>!["done","closed","cancelled"].includes(item.status)));
      setError("");
    }catch(e){setError(errorMessage(e))}
  }
  useEffect(()=>{void load()},[role]);

  const activeTotal=(summary?.activeServiceOrders??0)+(summary?.activeHousekeeping??0)+(summary?.activeMaintenance??0);
  const assignable=useMemo(()=>orders.filter(order=>staff.some(person=>canTake(person.role,order.category))),[orders,staff]);

  async function assign(order:LiveServiceOrder){
    const assignedUserId=selected[order.id];
    if(!assignedUserId)return;
    setBusy(order.id);
    try{
      await api.assignServiceOrder({id:order.id,assignedUserId,version:order.version});
      await load();
    }catch(e){setError(errorMessage(e))}
    finally{setBusy("")}
  }

  return <div className="teamWorkload">
    {error&&<div className="notice">{t(String(error))}</div>}
    <section className="kpis">
      <article><span>{t("Staff records")}</span><b>{staff.length}</b></article>
      <article><span>{t("Active workload")}</span><b>{activeTotal}</b></article>
      <article><span>{t("Unassigned service orders")}</span><b>{summary?.unassignedServiceOrders??"—"}</b></article>
      <article><span>{t("Role scope")}</span><b>{t(String(role.replace(/_/g," ")))}</b></article>
    </section>

    <Panel title={t("Staff workload")}>
      {staff.length===0?<div className="emptyLine">{t("No active staff records in this property scope.")}</div>:
      <div className="workloadGrid">{staff.map(person=><article key={person.userId+person.role}>
        <div><b>{person.displayName}</b><small>{t(String(person.role.replace(/_/g," ")))}</small></div>
        <span>{t("Service")}{' '}<strong>{person.openServiceOrders}</strong></span>
        <span>{t("Housekeeping")}{' '}<strong>{person.openHousekeeping}</strong></span>
        <span>{t("Maintenance")}{' '}<strong>{person.openMaintenance}</strong></span>
        <span>{t("Done today")}{' '}<strong>{person.serviceDoneToday}</strong></span>
        <i className={person.activeTasks>=4?"busy":"available"}>{person.activeTasks>=4?t("busy"):t("available")}</i>
      </article>)}</div>}
    </Panel>

    <Panel title={t("Service-order assignment")}>
      {assignable.length===0?<div className="emptyLine">{t("No assignable open service orders in this role scope.")}</div>:
      <div className="orderList">{assignable.map(order=>{
        const candidates=staff.filter(person=>canTake(person.role,order.category));
        return <article className="order" key={order.id}>
          <div>
            <b>{order.title}</b>
            <span>{t(String(order.category.replace(/_/g," ")))} · {t(String(order.status.replace(/_/g," ")))} {' '}{t("· v")}{order.version}</span>
            <small>{order.assigned_user_id?t("Assigned: {id}",{id:order.assigned_user_id}):t("Unassigned")}</small>
          </div>
          <div className="orderActions">
            <select value={selected[order.id]??order.assigned_user_id??""} onChange={e=>setSelected(current=>({...current,[order.id]:e.target.value}))}>
              <option value="">{t("Select staff")}</option>
              {candidates.map(person=><option key={person.userId+person.role} value={person.userId}>{person.displayName} · {t(String(person.role.replace(/_/g," ")))}</option>)}
            </select>
            <button className="primary" disabled={busy!==""||!(selected[order.id]??order.assigned_user_id)} onClick={()=>assign(order)}>
              {order.assigned_user_id?t("Reassign"):t("Assign")}
            </button>
          </div>
        </article>;
      })}</div>}
    </Panel>
  </div>;
}

const providerLabels:Record<string,string>={
  booking_com:"Booking.com",
  airbnb:"Airbnb",
  ai_concierge:"AI Concierge"
};

function integrationStatusClass(status:string){
  return status==="configured"||status==="healthy"?"done":"assigned";
}

export function IntegrationHubLive(){
  const {t,locale}=useLegacyStaffLocale();
  const [items,setItems]=useState<LiveIntegrationStatus[]>([]);
  const [error,setError]=useState("");

  async function load(){
    try{
      const result=await api.integrationsStatus();
      setItems(result.items);
      setError("");
    }catch(e){setError(errorMessage(e))}
  }
  useEffect(()=>{void load()},[]);

  return <Panel title={t("Integration Hub")}>
    {error&&<div className="notice">{t(String(error))}</div>}
    {items.length===0?<div className="emptyLine">{t("No integration records are configured for this organization.")}</div>:
    <div className="integrationGrid">{items.map(item=><article className="integrationCard" key={item.provider}>
      <div>
        <b>{t(providerLabels[item.provider]??item.provider.replace(/_/g," "))}</b>
        <span>{item.scopes.length?item.scopes.map(code=>t(code.replace(/_/g," "))).join(" · "):t("No scopes recorded")}</span>
        <small>{t("Last sync:")}{' '}{item.lastSyncAt?legacyDate(item.lastSyncAt,locale):t("never")} {' '}{t("· Health:")}{' '}{item.lastHealthAt?legacyDate(item.lastHealthAt,locale):t("not checked")}</small>
        {item.lastErrorCode&&<small>{t("Error:")}{' '}{item.lastErrorCode}</small>}
      </div>
      <span className={"status "+integrationStatusClass(item.status)}>{t(String(item.status.replace(/_/g," ")))}</span>
    </article>)}</div>}
    <div className="notice">{t("This screen reports persisted connector state only. Credentials and OAuth secrets are never returned to the browser.")}</div>
  </Panel>;
}
