import {useEffect,useMemo,useState} from "react";
import type {LiveFrontDeskReservation,LiveGuestProfile,LiveGuestReservation,LivePropertyUnit,LiveTimelineEvent} from "../../api/types";
import {api,ApiError} from "../../api/client";

function errorMessage(error:unknown){
  if(error instanceof ApiError)return error.body.error||error.message;
  return error instanceof Error?error.message:"Request failed";
}

function Panel({title,children}:{title:string;children:React.ReactNode}){
  return <section className="panel"><header><small>VIEWS LIVE CRM</small><h2>{title}</h2></header>{children}</section>;
}

export function Guest360Live(){
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
      <div><small>LIVE GUEST CRM</small><h2>Guest 360</h2></div>
      <select value={guestId} onChange={e=>setGuestId(e.target.value)}>
        {guests.map(item=><option key={item.guest_id} value={item.guest_id}>{item.first_name} {item.last_name}</option>)}
      </select>
    </div>
    {error&&<div className="notice">{error}</div>}
    {!guest?<div className="emptyLine">Select a guest from the property reservation queue.</div>:<>
      <div className="guestCard">
        <div className="avatarBig">{guest.first_name.slice(0,1)}{guest.last_name.slice(0,1)}</div>
        <div><small>GUEST360</small><h2>{guest.first_name} {guest.last_name}{guest.vip?" · VIP":""}</h2><p>{guest.email??"No email"} · {guest.phone??"No phone"}</p></div>
      </div>
      <div className="guest360Grid">
        <Panel title="Operational profile">
          <div className="detailRows">
            <span>Open service orders<b>{openServiceOrders}</b></span>
            <span>Reservations in property<b>{reservations.length}</b></span>
            <span>VIP flag<b>{guest.vip?"Yes":"No"}</b></span>
            <span>Guest record created<b>{guest.created_at}</b></span>
          </div>
        </Panel>
        <Panel title="Stay history">
          {reservations.length===0?<div className="emptyLine">No reservations in this property.</div>:<div className="compactRows">
            {reservations.map(item=><div key={item.id}>
              <span>{item.check_in_date} → {item.check_out_date}</span>
              <b>{item.confirmation_code}</b>
              <small>Apt {item.unit_code??"—"}{item.stay_status?" · "+item.stay_status:""}</small>
              <i className={"status "+item.status}>{item.status.replaceAll("_"," ")}</i>
            </div>)}
          </div>}
        </Panel>
      </div>
    </>}
  </div>;
}

export function StayCardLive(){
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
      <div><small>LIVE STAY CARD</small><h2>Guest & stay operations</h2></div>
      <select value={reservationId} onChange={e=>setReservationId(e.target.value)}>
        {queue.map(item=><option key={item.id} value={item.id}>{item.confirmation_code} · {item.first_name} {item.last_name}</option>)}
      </select>
    </div>
    {error&&<div className="notice">{error}</div>}
    {!record?<div className="emptyLine">Select a reservation.</div>:<>
      <header>
        <div className="avatarBig">{val("first_name").slice(0,1)}{val("last_name").slice(0,1)}</div>
        <div><small>STAY CARD</small><h2>{val("first_name")} {val("last_name")}{Number(record.vip)?" · VIP":""}</h2><p>Apt {val("unit_code")} · {val("property_name")} · {val("status")}</p></div>
        <span className={"status "+val("status")}>{val("status").replaceAll("_"," ")}</span>
      </header>
      <div className="stayGrid">
        <Panel title="Guest & booking">
          <div className="detailRows">
            <span>Confirmation<b>{val("confirmation_code")}</b></span>
            <span>Check-in date<b>{val("check_in_date")}</b></span>
            <span>Check-out date<b>{val("check_out_date")}</b></span>
            <span>Stay status<b>{val("stay_status")}</b></span>
            <span>Unit status<b>{val("unit_status")}</b></span>
          </div>
        </Panel>
        <Panel title="Services & operations">
          <div className="detailRows">
            <span>Open service orders<b>{operations?.openServiceOrders??"—"}</b></span>
            <span>Open maintenance<b>{operations?.openMaintenance??"—"}</b></span>
            <span>Housekeeping<b>{operations?.latestHousekeeping?String(operations.latestHousekeeping.status):"No job"}</b></span>
            <span>Checked in at<b>{val("checked_in_at")}</b></span>
            <span>Checked out at<b>{val("checked_out_at")}</b></span>
          </div>
        </Panel>
      </div>
    </>}
  </div>;
}

export function ApartmentTimelineLive(){
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

  return <Panel title="Apartment Timeline">
    <div className="sectionHead">
      <div><small>UNIFIED EVENT STREAM</small><h2>{unit?"Apartment "+unit.code:"Select apartment"}</h2></div>
      <select value={unitId} onChange={e=>setUnitId(e.target.value)}>
        {units.map(item=><option key={item.id} value={item.id}>Apt {item.code} · {item.status}</option>)}
      </select>
    </div>
    {error&&<div className="notice">{error}</div>}
    {items.length===0?<div className="emptyLine">No persisted operational events for this apartment yet.</div>:
    <div className="apartmentTimeline">{items.map((item,i)=><article key={item.source+item.created_at+i}>
      <time>{item.created_at}</time><span/><div>
        <b>{item.source.replaceAll("_"," ")} · {item.event_type.replaceAll("_"," ")}</b>
        <small>{item.from_status??"—"} → {item.to_status??"—"}</small>
      </div>
    </article>)}</div>}
    <div className="notice">This stream is built only from persisted reservation, service-order, housekeeping and maintenance events.</div>
  </Panel>;
}
