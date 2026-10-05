import {useEffect,useState} from "react";
import type {HospitalityRole} from "../../domain/types";
import type {LiveStaffOverview} from "../../api/types";
import {api,ApiError} from "../../api/client";

function errorMessage(error:unknown){
  if(error instanceof ApiError)return error.body.error||error.message;
  return error instanceof Error?error.message:"Request failed";
}

function Panel({title,children}:{title:string;children:React.ReactNode}){
  return <section className="panel"><header><small>VIEWS LIVE OVERVIEW</small><h2>{title}</h2></header>{children}</section>;
}

export function LiveOverview({role}:{role:HospitalityRole}){
  const [data,setData]=useState<LiveStaffOverview|null>(null);
  const [error,setError]=useState("");

  useEffect(()=>{
    void api.staffOverview("utower")
      .then(result=>{setData(result);setError("")})
      .catch(e=>setError(errorMessage(e)));
  },[role]);

  if(error)return <div className="notice">{error}</div>;
  if(!data)return <div className="notice">Loading live operational overview…</div>;

  const cards:Array<[string,number|string]>=[
    ["Open service orders",data.counts.serviceOrdersOpen]
  ];
  if(data.counts.arrivals!==null)cards.push(["Arrivals",data.counts.arrivals]);
  if(data.counts.inHouse!==null)cards.push(["In house",data.counts.inHouse]);
  if(data.counts.readyUnits!==null)cards.push(["Ready units",data.counts.readyUnits]);
  if(data.counts.housekeepingOpen!==null)cards.push(["Housekeeping open",data.counts.housekeepingOpen]);
  if(data.counts.maintenanceOpen!==null)cards.push(["Maintenance open",data.counts.maintenanceOpen]);

  return <div>
    <div className="sectionHead">
      <div>
        <small>{data.property.city.toUpperCase()} · LIVE PROPERTY</small>
        <h2>{data.property.name}</h2>
      </div>
      <span className="roleLock">{data.role.replaceAll("_"," ")}</span>
    </div>

    <section className="kpis">
      {cards.slice(0,6).map(([label,value])=><article key={label}><span>{label}</span><b>{value}</b></article>)}
    </section>

    <div className="staffBoard">
      <Panel title="Priority service queue">
        {data.recentServiceOrders.length===0?<div className="emptyLine">No open service orders in this role scope.</div>:
        <div className="compactRows">{data.recentServiceOrders.map(item=><div key={item.id}>
          <span>{item.priority}</span>
          <b>{item.title}</b>
          <small>{item.category.replaceAll("_"," ")} · {item.unit_id?"Unit "+item.unit_id:"Property task"}</small>
          <i className={"status "+item.status}>{item.status.replaceAll("_"," ")}</i>
        </div>)}</div>}
      </Panel>

      <Panel title="Arrival / in-house queue">
        {data.arrivalItems.length===0?<div className="emptyLine">No front-desk queue is available for this role, or no arrivals/in-house stays are open.</div>:
        <div className="compactRows">{data.arrivalItems.map(item=><div key={item.id}>
          <span>{item.check_in_date} → {item.check_out_date}</span>
          <b>{item.first_name} {item.last_name}{item.vip?" · VIP":""}</b>
          <small>{item.confirmation_code} · Apt {item.unit_code??"—"}</small>
          <i className={"status "+item.status}>{item.status.replaceAll("_"," ")}</i>
        </div>)}</div>}
      </Panel>
    </div>

    <div className="notice">Overview values are calculated from the authenticated property and role scope. No revenue, occupancy or SLA metric is displayed unless backed by persisted data.</div>
  </div>;
}
