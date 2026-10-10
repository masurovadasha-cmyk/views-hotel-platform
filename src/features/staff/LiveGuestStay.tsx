import {useLegacyStaffLocale,legacyDate} from './LegacyStaffLocale';
import {useEffect,useMemo,useState} from "react";
import type {LiveFrontDeskReservation,LiveGuestProfile,LiveGuestReservation,LivePropertyUnit,LiveTimelineEvent} from "../../api/types";
import {api,ApiError} from "../../api/client";

function errorMessage(error:unknown){
  if(error instanceof ApiError)return error.body.error||error.message;
  return error instanceof Error?error.message:"Request failed";
}

function Panel({title,children}:{title:string;children:React.ReactNode}){
  const {t,locale}=useLegacyStaffLocale();
  return <section className="panel"><header><small>{t("VIEWS LIVE CRM")}</small><h2>{t(String(title))}</h2></header>{children}</section>;
}

export function Guest360Live(){
  const {t,locale}=useLegacyStaffLocale();
  const [queue,setQueue]=useState<LiveFrontDeskReservation[]>([]);
  const [guestId,setGuestId]=useState("");
  const [guest,setGuest]=useState<LiveGuestProfile|null>(null);
  const [reservations,setReservations]=useState<LiveGuestReservation[]>([]);
  const [openServiceOrders,setOpenServiceOrders]=useState(0);
  const [error,setError]=useState("");

  useEffect(()=>{
    void api.frontDeskReservations("utower")
      .then(result=>{
        setQueue(result.items);
        if(result.items[0])setGuestId(result.items[0].guest_id);
      })
      .catch(e=>setError(errorMessage(e)));
  },[]);

  useEffect(()=>{
    if(!guestId)return;
    void api.guest360(guestId,"utower")
      .then(result=>{
        setGuest(result.guest);
        setReservations(result.reservations);
        setOpenServiceOrders(result.openServiceOrders);
        setError("");
      })
      .catch(e=>setError(errorMessage(e)));
  },[guestId]);

  const guests=useMemo(()=>{
    const seen=new Set<string>();
    return queue.filter(item=>{
      if(seen.has(item.guest_id))return false;
      seen.add(item.guest_id);
      return true;
    });
  },[queue]);

  return <div className="guest360">
    <div className="sectionHead">
      <div><small>{t("LIVE GUEST CRM")}</small><h2>{t("Guest 360")}</h2></div>
      <select value={guestId} onChange={e=>setGuestId(e.target.value)}>
        {guests.map(item=><option key={item.guest_id} value={item.guest_id}>{item.first_name} {item.last_name}</option>)}
      </select>
    </div>
    {error&&<div className="notice">{t(String(error))}</div>}
    {!guest?<div className="emptyLine">{t("Select a guest from the property reservation queue.")}</div>:<>
      <div className="guestCard">
        <div className="avatarBig">{guest.first_name.slice(0,1)}{guest.last_name.slice(0,1)}</div>
        <div><small>GUEST360</small><h2>{guest.first_name} {guest.last_name}{guest.vip?t(" · VIP"):""}</h2><p>{guest.email??t("No email")} · {guest.phone??t("No phone")}</p></div>
      </div>
      <div className="guest360Grid">
        <Panel title={t("Operational profile")}>
          <div className="detailRows">
            <span>{t("Open service orders")}<b>{openServiceOrders}</b></span>
            <span>{t("Reservations in property")}<b>{reservations.length}</b></span>
            <span>{t("VIP flag")}<b>{guest.vip?t("Yes"):t("No")}</b></span>
            <span>{t("Guest record created")}<b>{legacyDate(guest.created_at,locale)}</b></span>
          </div>
        </Panel>
        <Panel title={t("Stay history")}>
          {reservations.length===0?<div className="emptyLine">{t("No reservations in this property.")}</div>:<div className="compactRows">
            {reservations.map(item=><div key={item.id}>
              <span>{legacyDate(item.check_in_date,locale,true)} → {legacyDate(item.check_out_date,locale,true)}</span>
              <b>{item.confirmation_code}</b>
              <small>{t("Apt")}{' '}{item.unit_code??"—"}{item.stay_status?" · "+t(item.stay_status):""}</small>
              <i className={"status "+item.status}>{t(String(item.status.replace(/_/g," ")))}</i>
            </div>)}
          </div>}
        </Panel>
      </div>
    </>}
  </div>;
}

export function StayCardLive(){
  const {t,locale}=useLegacyStaffLocale();
  const [queue,setQueue]=useState<LiveFrontDeskReservation[]>([]);
  const [reservationId,setReservationId]=useState("");
  const [record,setRecord]=useState<Record<string,unknown>|null>(null);
  const [operations,setOperations]=useState<{openServiceOrders:number;openMaintenance:number;latestHousekeeping:Record<string,unknown>|null}|null>(null);
  const [error,setError]=useState("");

  useEffect(()=>{
    void api.frontDeskReservations("utower")
      .then(result=>{
        setQueue(result.items);
        const preferred=result.items.find(x=>x.status==="checked_in")??result.items[0];
        if(preferred)setReservationId(preferred.id);
      })
      .catch(e=>setError(errorMessage(e)));
  },[]);

  useEffect(()=>{
    if(!reservationId)return;
    void api.stayCard(reservationId,"utower")
      .then(result=>{setRecord(result.reservation);setOperations(result.operations);setError("")})
      .catch(e=>setError(errorMessage(e)));
  },[reservationId]);

  const val=(key:string)=>record?.[key]==null?"—":String(record[key]);

  return <div className="stayCard">
    <div className="sectionHead">
      <div><small>{t("LIVE STAY CARD")}</small><h2>{t("Guest & stay operations")}</h2></div>
      <select value={reservationId} onChange={e=>setReservationId(e.target.value)}>
        {queue.map(item=><option key={item.id} value={item.id}>{item.confirmation_code} · {item.first_name} {item.last_name}</option>)}
      </select>
    </div>
    {error&&<div className="notice">{t(String(error))}</div>}
    {!record?<div className="emptyLine">{t("Select a reservation.")}</div>:<>
      <header>
        <div className="avatarBig">{val("first_name").slice(0,1)}{val("last_name").slice(0,1)}</div>
        <div><small>{t("STAY CARD")}</small><h2>{val("first_name")} {val("last_name")}{Number(record.vip)?t(" · VIP"):""}</h2><p>{t("Apt")}{' '}{val("unit_code")} · {val("property_name")} · {t(String(val("status")))}</p></div>
        <span className={"status "+val("status")}>{t(String(val("status").replace(/_/g," ")))}</span>
      </header>
      <div className="stayGrid">
        <Panel title={t("Guest & booking")}>
          <div className="detailRows">
            <span>{t("Confirmation")}<b>{val("confirmation_code")}</b></span>
            <span>{t("Check-in date")}<b>{legacyDate(val("check_in_date"),locale,true)}</b></span>
            <span>{t("Check-out date")}<b>{legacyDate(val("check_out_date"),locale,true)}</b></span>
            <span>{t("Stay status")}<b>{t(String(val("stay_status")))}</b></span>
            <span>{t("Unit status")}<b>{t(String(val("unit_status")))}</b></span>
          </div>
        </Panel>
        <Panel title={t("Services & operations")}>
          <div className="detailRows">
            <span>{t("Open service orders")}<b>{operations?.openServiceOrders??"—"}</b></span>
            <span>{t("Open maintenance")}<b>{operations?.openMaintenance??"—"}</b></span>
            <span>{t("Housekeeping")}<b>{operations?.latestHousekeeping?t(String(operations.latestHousekeeping.status)):t("No job")}</b></span>
            <span>{t("Checked in at")}<b>{legacyDate(val("checked_in_at"),locale)}</b></span>
            <span>{t("Checked out at")}<b>{legacyDate(val("checked_out_at"),locale)}</b></span>
          </div>
        </Panel>
      </div>
    </>}
  </div>;
}

export function ApartmentTimelineLive(){
  const {t,locale}=useLegacyStaffLocale();
  const [units,setUnits]=useState<LivePropertyUnit[]>([]);
  const [unitId,setUnitId]=useState("");
  const [unit,setUnit]=useState<{id:string;propertyId:string;code:string;name:string;status:string}|null>(null);
  const [items,setItems]=useState<LiveTimelineEvent[]>([]);
  const [error,setError]=useState("");

  useEffect(()=>{
    void api.propertyUnits("utower")
      .then(result=>{
        setUnits(result.items);
        const preferred=result.items.find(x=>x.code==="250")??result.items[0];
        if(preferred)setUnitId(preferred.id);
      })
      .catch(e=>setError(errorMessage(e)));
  },[]);

  useEffect(()=>{
    if(!unitId)return;
    void api.apartmentTimeline(unitId)
      .then(result=>{setUnit(result.unit);setItems(result.items);setError("")})
      .catch(e=>setError(errorMessage(e)));
  },[unitId]);

  return <Panel title={t("Apartment Timeline")}>
    <div className="sectionHead">
      <div><small>{t("UNIFIED EVENT STREAM")}</small><h2>{unit?t("Apartment {unit}",{unit:unit.code}):t("Select apartment")}</h2></div>
      <select value={unitId} onChange={e=>setUnitId(e.target.value)}>
        {units.map(item=><option key={item.id} value={item.id}>{t("Apt")}{' '}{item.code} · {t(String(item.status))}</option>)}
      </select>
    </div>
    {error&&<div className="notice">{t(String(error))}</div>}
    {items.length===0?<div className="emptyLine">{t("No persisted operational events for this apartment yet.")}</div>:
    <div className="apartmentTimeline">{items.map((item,i)=><article key={item.source+item.created_at+i}>
      <time>{legacyDate(item.created_at,locale)}</time><span/><div>
        <b>{t(String(item.source.replace(/_/g," ")))} · {t(String(item.event_type.replace(/_/g," ")))}</b>
        <small>{t(String(item.from_status??"—"))} → {t(String(item.to_status??"—"))}</small>
      </div>
    </article>)}</div>}
    <div className="notice">{t("This stream is built only from persisted reservation, service-order, housekeeping and maintenance events.")}</div>
  </Panel>;
}
