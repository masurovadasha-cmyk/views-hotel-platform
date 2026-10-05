import {useEffect,useMemo,useState} from "react";
import type {HospitalityRole} from "../../domain/types";
import type {LiveFrontDeskReservation} from "../../api/types";
import {api,ApiError} from "../../api/client";

function errorMessage(error:unknown){
  if(error instanceof ApiError)return error.body.error||error.message;
  return error instanceof Error?error.message:"Request failed";
}

export function LiveFrontDesk({role}:{role:HospitalityRole}){
  const [items,setItems]=useState<LiveFrontDeskReservation[]>([]);
  const [error,setError]=useState("");
  const [busy,setBusy]=useState("");

  async function load(){
    try{
      const result=await api.frontDeskReservations("utower");
      setItems(result.items);
      setError("");
    }catch(err){setError(errorMessage(err))}
  }

  useEffect(()=>{void load()},[]);

  async function act(item:LiveFrontDeskReservation,action:"check_in"|"check_out"){
    setBusy(item.id+":"+action);
    try{
      await api.frontDeskAction({id:item.id,action,version:item.version});
      await load();
    }catch(err){setError(errorMessage(err))}
    finally{setBusy("")}
  }

  const arrivals=useMemo(()=>items.filter(x=>["confirmed","assigned"].includes(x.status)),[items]);
  const inHouse=useMemo(()=>items.filter(x=>x.status==="checked_in"),[items]);
  const ready=useMemo(()=>items.filter(x=>["ready","available"].includes(x.unit_status||"")), [items]);

  return <div className="staffBoard">
    <section className="panel">
      <header><small>VIEWS LIVE FRONT DESK</small><h2>Arrivals & active stays</h2></header>
      <section className="kpis">
        <article><span>Arrivals</span><b>{arrivals.length}</b></article>
        <article><span>In house</span><b>{inHouse.length}</b></article>
        <article><span>Ready units</span><b>{ready.length}</b></article>
        <article><span>Role</span><b>{role.replaceAll("_"," ")}</b></article>
      </section>

      {error&&<div className="notice">{error}</div>}
      {items.length===0?<div className="emptyLine">No front-desk reservations in this property queue.</div>:
      <div className="orderList">{items.map(item=><article className="order" key={item.id}>
        <div>
          <b>{item.first_name} {item.last_name}{item.vip?" · VIP":""}</b>
          <span>{item.confirmation_code} · Apt {item.unit_code??"—"} · {item.check_in_date} → {item.check_out_date}</span>
          <small>{"Unit: "+(item.unit_status??"unassigned")+(item.stay_status?" · Stay: "+item.stay_status:"")}</small>
        </div>
        <span className={"status "+item.status}>{item.status.replaceAll("_"," ")}</span>
        <div className="orderActions">
          {["confirmed","assigned"].includes(item.status)&&
            <button className="primary" disabled={busy!==""||!["ready","available"].includes(item.unit_status||"")} onClick={()=>act(item,"check_in")}>Check in</button>}
          {item.status==="checked_in"&&
            <button className="primary" disabled={busy!==""} onClick={()=>act(item,"check_out")}>Check out</button>}
          {item.status==="completed"&&<span>Completed · housekeeping queued</span>}
        </div>
      </article>)}</div>}
    </section>

    <section className="panel">
      <header><small>GOLDEN FLOW</small><h2>Reservation → stay → turnover</h2></header>
      <div className="workflow"><span><b>confirmed</b></span><span><i>→</i><b>checked_in</b></span><span><i>→</i><b>occupied</b></span><span><i>→</i><b>completed</b></span><span><i>→</i><b>dirty</b></span><span><i>→</i><b>housekeeping</b></span></div>
      <div className="notice">Check-out atomically completes the reservation, closes the stay, marks the apartment dirty and creates the turnover housekeeping job.</div>
    </section>
  </div>;
}
