import {useEffect,useMemo,useState} from "react";
import type {HospitalityRole,ServiceCategory} from "../../domain/types";
import type {LiveIntegrationStatus,LiveServiceOrder,LiveStaffWorkload,LiveTeamSummary} from "../../api/types";
import {api,ApiError} from "../../api/client";

function errorMessage(error:unknown){
  if(error instanceof ApiError)return error.body.error||error.message;
  return error instanceof Error?error.message:"Request failed";
}

function Panel({title,children}:{title:string;children:React.ReactNode}){
  return <section className="panel"><header><small>VIEWS LIVE CONTROL</small><h2>{title}</h2></header>{children}</section>;
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
    {error&&<div className="notice">{error}</div>}
    <section className="kpis">
      <article><span>Staff records</span><b>{staff.length}</b></article>
      <article><span>Active workload</span><b>{activeTotal}</b></article>
      <article><span>Unassigned service orders</span><b>{summary?.unassignedServiceOrders??"—"}</b></article>
      <article><span>Role scope</span><b>{role.replaceAll("_"," ")}</b></article>
    </section>

    <Panel title="Staff workload">
      {staff.length===0?<div className="emptyLine">No active staff records in this property scope.</div>:
      <div className="workloadGrid">{staff.map(person=><article key={person.userId+person.role}>
        <div><b>{person.displayName}</b><small>{person.role.replaceAll("_"," ")}</small></div>
        <span>Service <strong>{person.openServiceOrders}</strong></span>
        <span>Housekeeping <strong>{person.openHousekeeping}</strong></span>
        <span>Maintenance <strong>{person.openMaintenance}</strong></span>
        <span>Done today <strong>{person.serviceDoneToday}</strong></span>
        <i className={person.activeTasks>=4?"busy":"available"}>{person.activeTasks>=4?"busy":"available"}</i>
      </article>)}</div>}
    </Panel>

    <Panel title="Service-order assignment">
      {assignable.length===0?<div className="emptyLine">No assignable open service orders in this role scope.</div>:
      <div className="orderList">{assignable.map(order=>{
        const candidates=staff.filter(person=>canTake(person.role,order.category));
        return <article className="order" key={order.id}>
          <div>
            <b>{order.title}</b>
            <span>{order.category.replaceAll("_"," ")} · {order.status.replaceAll("_"," ")} · v{order.version}</span>
            <small>{order.assigned_user_id?"Assigned: "+order.assigned_user_id:"Unassigned"}</small>
          </div>
          <div className="orderActions">
            <select value={selected[order.id]??order.assigned_user_id??""} onChange={e=>setSelected(current=>({...current,[order.id]:e.target.value}))}>
              <option value="">Select staff</option>
              {candidates.map(person=><option key={person.userId+person.role} value={person.userId}>{person.displayName} · {person.role.replaceAll("_"," ")}</option>)}
            </select>
            <button className="primary" disabled={busy!==""||!(selected[order.id]??order.assigned_user_id)} onClick={()=>assign(order)}>
              {order.assigned_user_id?"Reassign":"Assign"}
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

  return <Panel title="Integration Hub">
    {error&&<div className="notice">{error}</div>}
    {items.length===0?<div className="emptyLine">No integration records are configured for this organization.</div>:
    <div className="integrationGrid">{items.map(item=><article className="integrationCard" key={item.provider}>
      <div>
        <b>{providerLabels[item.provider]??item.provider.replaceAll("_"," ")}</b>
        <span>{item.scopes.length?item.scopes.join(" · "):"No scopes recorded"}</span>
        <small>Last sync: {item.lastSyncAt??"never"} · Health: {item.lastHealthAt??"not checked"}</small>
        {item.lastErrorCode&&<small>Error: {item.lastErrorCode}</small>}
      </div>
      <span className={"status "+integrationStatusClass(item.status)}>{item.status.replaceAll("_"," ")}</span>
    </article>)}</div>}
    <div className="notice">This screen reports persisted connector state only. Credentials and OAuth secrets are never returned to the browser.</div>
  </Panel>;
}
