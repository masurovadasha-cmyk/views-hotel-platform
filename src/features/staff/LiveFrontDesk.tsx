import {useLegacyStaffLocale,legacyDate} from './LegacyStaffLocale';
import {useEffect,useMemo,useState} from "react";
import type {HospitalityRole} from "../../domain/types";
import type {LiveFrontDeskReservation} from "../../api/types";
import {api,ApiError} from "../../api/client";

function errorMessage(error:unknown){
  if(error instanceof ApiError)return error.body.error||error.message;
  return error instanceof Error?error.message:"Request failed";
}

export function LiveFrontDesk({role}:{role:HospitalityRole}){
  const {t,locale}=useLegacyStaffLocale();
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
      <header><small>{t("VIEWS LIVE FRONT DESK")}</small><h2>{t("Arrivals & active stays")}</h2></header>
      <section className="kpis">
        <article><span>{t("Arrivals")}</span><b>{arrivals.length}</b></article>
        <article><span>{t("In house")}</span><b>{inHouse.length}</b></article>
        <article><span>{t("Ready units")}</span><b>{ready.length}</b></article>
        <article><span>{t("Role")}</span><b>{t(String(role.replace(/_/g," ")))}</b></article>
      </section>

      {error&&<div className="notice">{t(String(error))}</div>}
      {items.length===0?<div className="emptyLine">{t("No front-desk reservations in this property queue.")}</div>:
      <div className="orderList">{items.map(item=><article className="order" key={item.id}>
        <div>
          <b>{item.first_name} {item.last_name}{item.vip?t(" · VIP"):""}</b>
          <span>{item.confirmation_code} {' '}{t("· Apt")}{' '}{item.unit_code??"—"} · {legacyDate(item.check_in_date,locale,true)} → {legacyDate(item.check_out_date,locale,true)}</span>
          <small>{t("Unit: {unit} · Stay: {stay}",{unit:t(item.unit_status??"unassigned"),stay:t(item.stay_status??"—")})}</small>
        </div>
        <span className={"status "+item.status}>{t(String(item.status.replace(/_/g," ")))}</span>
        <div className="orderActions">
          {["confirmed","assigned"].includes(item.status)&&
            <button className="primary" disabled={busy!==""||!["ready","available"].includes(item.unit_status||"")} onClick={()=>act(item,"check_in")}>{t("Check in")}</button>}
          {item.status==="checked_in"&&
            <button className="primary" disabled={busy!==""} onClick={()=>act(item,"check_out")}>{t("Check out")}</button>}
          {item.status==="completed"&&<span>{t("Completed · housekeeping queued")}</span>}
        </div>
      </article>)}</div>}
    </section>

    <section className="panel">
      <header><small>{t("GOLDEN FLOW")}</small><h2>{t("Reservation → stay → turnover")}</h2></header>
      <div className="workflow"><span><b>{t("confirmed")}</b></span><span><i>→</i><b>{t("checked_in")}</b></span><span><i>→</i><b>{t("occupied")}</b></span><span><i>→</i><b>{t("completed")}</b></span><span><i>→</i><b>{t("dirty")}</b></span><span><i>→</i><b>{t("housekeeping")}</b></span></div>
      <div className="notice">{t("Check-out atomically completes the reservation, closes the stay, marks the apartment dirty and creates the turnover housekeeping job.")}</div>
    </section>
  </div>;
}
