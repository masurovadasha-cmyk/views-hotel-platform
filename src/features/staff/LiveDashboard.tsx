import {useEffect,useMemo,useState} from "react";
import type {HospitalityRole} from "../../domain/types";
import type {LiveFrontDeskReservation,LiveHousekeepingJob,LiveMaintenanceTicket,LivePropertyUnit,LiveServiceOrder} from "../../api/types";
import {api,ApiError} from "../../api/client";

function errorText(error:unknown){
  if(error instanceof ApiError)return error.body.error||error.message;
  return error instanceof Error?error.message:"Request failed";
}

function Panel({title,children}:{title:string;children:React.ReactNode}){
  return <section className="panel"><header><small>VIEWS LIVE OVERVIEW</small><h2>{title}</h2></header>{children}</section>;
}

const management=(role:HospitalityRole)=>role==="general_manager"||role==="super_admin";
const frontDeskRole=(role:HospitalityRole)=>["front_desk","reservation_manager","general_manager","super_admin"].includes(role);
const housekeepingRole=(role:HospitalityRole)=>["cleaner","housekeeping_supervisor","general_manager","super_admin"].includes(role);
const maintenanceRole=(role:HospitalityRole)=>["technician","maintenance_manager","general_manager","super_admin"].includes(role);

export function LiveDashboard({role}:{role:HospitalityRole}){
  const [units,setUnits]=useState<LivePropertyUnit[]>([]);
  const [orders,setOrders]=useState<LiveServiceOrder[]>([]);
  const [reservations,setReservations]=useState<LiveFrontDeskReservation[]>([]);
  const [housekeeping,setHousekeeping]=useState<LiveHousekeepingJob[]>([]);
  const [maintenance,setMaintenance]=useState<LiveMaintenanceTicket[]>([]);
  const [error,setError]=useState("");

  useEffect(()=>{
    let cancelled=false;
    void (async()=>{
      try{
        const [unitsResult,ordersResult]=await Promise.all([
          api.propertyUnits("utower"),
          api.serviceOrders("utower")
        ]);
        if(cancelled)return;
        setUnits(unitsResult.items);
        setOrders(ordersResult.items);

        if(frontDeskRole(role)){
          const result=await api.frontDeskReservations("utower");
          if(!cancelled)setReservations(result.items);
        }else setReservations([]);

        if(housekeepingRole(role)){
          const result=await api.housekeepingJobs("utower");
          if(!cancelled)setHousekeeping(result.items);
        }else setHousekeeping([]);

        if(maintenanceRole(role)){
          const result=await api.maintenanceTickets("utower");
          if(!cancelled)setMaintenance(result.items);
        }else setMaintenance([]);

        if(!cancelled)setError("");
      }catch(err){
        if(!cancelled)setError(errorText(err));
      }
    })();
    return ()=>{cancelled=true};
  },[role]);

  const openOrders=useMemo(()=>orders.filter(x=>!["done","closed","cancelled"].includes(x.status)),[orders]);
  const arrivals=useMemo(()=>reservations.filter(x=>["confirmed","assigned"].includes(x.status)),[reservations]);
  const inHouse=useMemo(()=>reservations.filter(x=>x.status==="checked_in"),[reservations]);
  const activeHousekeeping=useMemo(()=>housekeeping.filter(x=>!["ready","service_declined"].includes(x.status)),[housekeeping]);
  const activeMaintenance=useMemo(()=>maintenance.filter(x=>x.status!=="closed"),[maintenance]);
  const readyUnits=useMemo(()=>units.filter(x=>["ready","available"].includes(x.status)).length,[units]);
  const occupiedUnits=useMemo(()=>units.filter(x=>x.status==="occupied").length,[units]);
  const dirtyUnits=useMemo(()=>units.filter(x=>x.status==="dirty").length,[units]);

  const primaryMetric=role==="cleaner"
    ?{label:"Housekeeping",value:activeHousekeeping.length}
    :role==="technician"
      ?{label:"Maintenance",value:activeMaintenance.length}
      :{label:"Open tasks",value:openOrders.length};

  return <div>
    {error&&<div className="notice">{error}</div>}
    <section className="kpis">
      <article><span>{primaryMetric.label}</span><b>{primaryMetric.value}</b></article>
      <article><span>{frontDeskRole(role)?"Arrivals":"Ready units"}</span><b>{frontDeskRole(role)?arrivals.length:readyUnits}</b></article>
      <article><span>{frontDeskRole(role)?"In house":"Occupied units"}</span><b>{frontDeskRole(role)?inHouse.length:occupiedUnits}</b></article>
      <article><span>Role</span><b>{role.replaceAll("_"," ")}</b></article>
    </section>

    <div className="staffBoard">
      <Panel title="Current work">
        {openOrders.length===0?<div className="emptyLine">No open service orders visible to this role.</div>:
        <div className="compactRows">{openOrders.slice(0,6).map(order=><div key={order.id}>
          <span>{order.priority}</span>
          <b>{order.title}</b>
          <small>{order.category.replaceAll("_"," ")} · {order.unit_id?"Apt "+order.unit_id:"Property task"}</small>
          <i className={"status "+order.status}>{order.status.replaceAll("_"," ")}</i>
        </div>)}</div>}
      </Panel>

      <Panel title="Property readiness">
        <section className="kpis">
          <article><span>Ready</span><b>{readyUnits}</b></article>
          <article><span>Occupied</span><b>{occupiedUnits}</b></article>
          <article><span>Dirty</span><b>{dirtyUnits}</b></article>
          <article><span>Total units</span><b>{units.length}</b></article>
        </section>
        <div className="compactRows">{units.slice(0,8).map(unit=><div key={unit.id}>
          <span>Apt {unit.code}</span>
          <b>{unit.name}</b>
          <small>{unit.capacity} guests · {unit.bedrooms} BR</small>
          <i className={"status "+unit.status}>{unit.status.replaceAll("_"," ")}</i>
        </div>)}</div>
      </Panel>
    </div>

    {management(role)&&<div className="notice">Overview contains only persisted operational data; no occupancy, revenue or SLA KPI is synthesized.</div>}
  </div>;
}
