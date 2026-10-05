import {useEffect,useState} from "react";
import type {HospitalityRole} from "../../domain/types";
import type {LiveHousekeepingJob,LiveMaintenanceTicket} from "../../api/types";
import {api,ApiError} from "../../api/client";

function errorText(error:unknown){
  if(error instanceof ApiError)return error.body.error||error.message;
  return error instanceof Error?error.message:"Request failed";
}

function Panel({title,children}:{title:string;children:React.ReactNode}){
  return <section className="panel"><header><small>VIEWS LIVE OPERATIONS</small><h2>{title}</h2></header>{children}</section>;
}

export function HousekeepingLive({role}:{role:HospitalityRole}){
  const [jobs,setJobs]=useState<LiveHousekeepingJob[]>([]);
  const [error,setError]=useState("");
  const [busy,setBusy]=useState("");

  async function load(){
    try{
      const result=await api.housekeepingJobs("utower");
      setJobs(result.items);
      setError("");
    }catch(err){setError(errorText(err))}
  }

  useEffect(()=>{void load()},[]);

  async function act(id:string,action:"start"|"complete"|"verify"|"dnd"|"decline"){
    setBusy(id+":"+action);
    try{await api.housekeepingAction(id,action);await load()}
    catch(err){setError(errorText(err))}
    finally{setBusy("")}
  }

  const canVerify=["housekeeping_supervisor","general_manager","super_admin"].includes(role);

  return <div className="staffBoard">
    <Panel title="Housekeeping queue">
      {error&&<div className="notice">{error}</div>}
      {jobs.length===0?<div className="emptyLine">No housekeeping jobs assigned to this queue.</div>:
      <div className="orderList">{jobs.map(job=><article className="order" key={job.id}>
        <div><b>Apartment {job.unit_code}</b><span>Housekeeping · {job.assigned_user_id?"assigned":"unassigned"}</span></div>
        <span className={"status "+job.status}>{job.status.replaceAll("_"," ")}</span>
        <div className="orderActions">
          {job.status==="dirty"&&<button className="primary" disabled={busy!==""} onClick={()=>act(job.id,"start")}>Start</button>}
          {job.status==="dirty"&&<button disabled={busy!==""} onClick={()=>act(job.id,"decline")}>Decline</button>}
          {(job.status==="dirty"||job.status==="cleaning")&&<button disabled={busy!==""} onClick={()=>act(job.id,"dnd")}>DND</button>}
          {job.status==="cleaning"&&<button className="primary" disabled={busy!==""} onClick={()=>act(job.id,"complete")}>Complete</button>}
          {job.status==="inspection"&&canVerify&&<button className="primary" disabled={busy!==""} onClick={()=>act(job.id,"verify")}>Verify ready</button>}
          {job.status==="inspection"&&!canVerify&&<span>Awaiting supervisor verification</span>}
        </div>
      </article>)}</div>}
    </Panel>
    <Panel title="Housekeeping control">
      <div className="workflow"><span><b>dirty</b></span><span><i>→</i><b>cleaning</b></span><span><i>→</i><b>inspection</b></span><span><i>→</i><b>ready</b></span></div>
      <div className="notice">Cleaner actions and supervisor verification are enforced again on the server; UI buttons are not the authorization boundary.</div>
    </Panel>
  </div>;
}

export function MaintenanceLive({role}:{role:HospitalityRole}){
  const [tickets,setTickets]=useState<LiveMaintenanceTicket[]>([]);
  const [error,setError]=useState("");
  const [busy,setBusy]=useState("");

  async function load(){
    try{
      const result=await api.maintenanceTickets("utower");
      setTickets(result.items);
      setError("");
    }catch(err){setError(errorText(err))}
  }

  useEffect(()=>{void load()},[]);

  async function act(id:string,action:"start"|"wait"|"block"|"resolve"|"verify"){
    setBusy(id+":"+action);
    try{await api.maintenanceAction(id,action);await load()}
    catch(err){setError(errorText(err))}
    finally{setBusy("")}
  }

  const canVerify=["maintenance_manager","general_manager","super_admin"].includes(role);

  return <div className="staffBoard">
    <Panel title="Maintenance queue">
      {error&&<div className="notice">{error}</div>}
      {tickets.length===0?<div className="emptyLine">No maintenance tickets assigned to this queue.</div>:
      <div className="orderList">{tickets.map(ticket=><article className="order" key={ticket.id}>
        <div><b>{ticket.title}</b><span>Apt {ticket.unit_code??"—"} · {ticket.priority} priority</span></div>
        <span className={"status "+ticket.status}>{ticket.status.replaceAll("_"," ")}</span>
        <div className="orderActions">
          {(ticket.status==="open"||ticket.status==="assigned")&&<button className="primary" disabled={busy!==""} onClick={()=>act(ticket.id,"start")}>Start</button>}
          {["open","assigned","in_progress","waiting"].includes(ticket.status)&&<button disabled={busy!==""} onClick={()=>act(ticket.id,"block")}>Block</button>}
          {ticket.status==="in_progress"&&<button disabled={busy!==""} onClick={()=>act(ticket.id,"wait")}>Wait</button>}
          {["open","assigned","in_progress","waiting","blocked"].includes(ticket.status)&&<button className="primary" disabled={busy!==""} onClick={()=>act(ticket.id,"resolve")}>Resolve</button>}
          {ticket.status==="inspection"&&canVerify&&<button className="primary" disabled={busy!==""} onClick={()=>act(ticket.id,"verify")}>Verify & close</button>}
          {ticket.status==="inspection"&&!canVerify&&<span>Awaiting manager verification</span>}
        </div>
      </article>)}</div>}
    </Panel>
    <Panel title="Maintenance control">
      <div className="workflow"><span><b>open</b></span><span><i>→</i><b>in_progress</b></span><span><i>→</i><b>waiting / blocked</b></span><span><i>→</i><b>inspection</b></span><span><i>→</i><b>closed</b></span></div>
      <div className="notice">Technicians receive only their assigned tickets. Verification remains manager-only on the API.</div>
    </Panel>
  </div>;
}
