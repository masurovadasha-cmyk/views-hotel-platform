import {useLegacyStaffLocale,legacyDate} from './LegacyStaffLocale';
import {useEffect,useMemo,useState} from "react";
import type {HospitalityRole} from "../../domain/types";
import type {LiveAnalyticsDashboardSummary,LiveFrontDeskReservation,LiveHousekeepingJob,LiveMaintenanceTicket,LivePropertyUnit,LiveServiceOrder} from "../../api/types";
import {api,ApiError} from "../../api/client";

function errorText(error:unknown){
  if(error instanceof ApiError)return error.body.error||error.message;
  return error instanceof Error?error.message:"Request failed";
}

function analyticsErrorText(error:unknown){
  const code=errorText(error);
  if(code==="CORE_IDENTITY_NOT_LINKED")return "Core analytics identity is not linked for this staff account.";
  if(code==="CORE_API_NOT_CONFIGURED"||code==="CORE_API_KEY_NOT_CONFIGURED"){
    return "Core analytics connection is not configured.";
  }
  if(code==="CORE_API_UNAVAILABLE")return "Core analytics is temporarily unavailable.";
  return code;
}

function dashboardRange(now=new Date()){
  now=new Date(now.getTime()+5*3600000);
  const year=now.getUTCFullYear();
  const month=String(now.getUTCMonth()+1).padStart(2,"0");
  const day=String(now.getUTCDate()).padStart(2,"0");
  return {from:`${year}-${month}-01`,to:`${year}-${month}-${day}`};
}

function minorUnits(value:string,locale:string){
  try{return BigInt(value).toLocaleString(locale)}catch{return value}
}

function percent(value:number,locale:string){
  return new Intl.NumberFormat(locale,{style:"percent",minimumFractionDigits:1,maximumFractionDigits:1}).format(value);
}

function Panel({title,children}:{title:string;children:React.ReactNode}){
  const {t,locale}=useLegacyStaffLocale();
  return <section className="panel"><header><small>{t("VIEWS LIVE OVERVIEW")}</small><h2>{t(String(title))}</h2></header>{children}</section>;
}

const management=(role:HospitalityRole)=>role==="general_manager"||role==="super_admin";
const frontDeskRole=(role:HospitalityRole)=>["front_desk","reservation_manager","general_manager","super_admin"].includes(role);
const housekeepingRole=(role:HospitalityRole)=>["cleaner","housekeeping_supervisor","general_manager","super_admin"].includes(role);
const maintenanceRole=(role:HospitalityRole)=>["technician","maintenance_manager","general_manager","super_admin"].includes(role);

export function LiveDashboard({role}:{role:HospitalityRole}){
  const {t,locale}=useLegacyStaffLocale();
  const [units,setUnits]=useState<LivePropertyUnit[]>([]);
  const [orders,setOrders]=useState<LiveServiceOrder[]>([]);
  const [reservations,setReservations]=useState<LiveFrontDeskReservation[]>([]);
  const [housekeeping,setHousekeeping]=useState<LiveHousekeepingJob[]>([]);
  const [maintenance,setMaintenance]=useState<LiveMaintenanceTicket[]>([]);
  const [analytics,setAnalytics]=useState<LiveAnalyticsDashboardSummary|null>(null);
  const [analyticsError,setAnalyticsError]=useState("");
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

  useEffect(()=>{
    if(!management(role)){
      setAnalytics(null);
      setAnalyticsError("");
      return;
    }
    let cancelled=false;
    const range=dashboardRange();
    void api.analyticsDashboard(range.from,range.to)
      .then(result=>{
        if(cancelled)return;
        setAnalytics(result);
        setAnalyticsError("");
      })
      .catch(err=>{
        if(cancelled)return;
        setAnalytics(null);
        setAnalyticsError(analyticsErrorText(err));
      });
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
    {error&&<div className="notice">{t(String(error))}</div>}
    <section className="kpis">
      <article><span>{t(String(primaryMetric.label))}</span><b>{primaryMetric.value}</b></article>
      <article><span>{frontDeskRole(role)?t("Arrivals"):t("Ready units")}</span><b>{frontDeskRole(role)?arrivals.length:readyUnits}</b></article>
      <article><span>{frontDeskRole(role)?t("In house"):t("Occupied units")}</span><b>{frontDeskRole(role)?inHouse.length:occupiedUnits}</b></article>
      <article><span>{t("Role")}</span><b>{t(String(role.replace(/_/g," ")))}</b></article>
    </section>

    <div className="staffBoard">
      <Panel title={t("Current work")}>
        {openOrders.length===0?<div className="emptyLine">{t("No open service orders visible to this role.")}</div>:
        <div className="compactRows">{openOrders.slice(0,6).map(order=><div key={order.id}>
          <span>{t(String(order.priority))}</span>
          <b>{order.title}</b>
          <small>{t(String(order.category.replace(/_/g," ")))} · {order.unit_id?t("Apartment {unit}",{unit:order.unit_id}):t("Property task")}</small>
          <i className={"status "+order.status}>{t(String(order.status.replace(/_/g," ")))}</i>
        </div>)}</div>}
      </Panel>

      <Panel title={t("Property readiness")}>
        <section className="kpis">
          <article><span>{t("Ready")}</span><b>{readyUnits}</b></article>
          <article><span>{t("Occupied")}</span><b>{occupiedUnits}</b></article>
          <article><span>{t("Dirty")}</span><b>{dirtyUnits}</b></article>
          <article><span>{t("Total units")}</span><b>{units.length}</b></article>
        </section>
        <div className="compactRows">{units.slice(0,8).map(unit=><div key={unit.id}>
          <span>{t("Apt")}{' '}{unit.code}</span>
          <b>{unit.name}</b>
          <small>{unit.capacity} {' '}{t("guests ·")}{' '}{unit.bedrooms} BR</small>
          <i className={"status "+unit.status}>{t(String(unit.status.replace(/_/g," ")))}</i>
        </div>)}</div>
      </Panel>
    </div>

    {management(role)&&<Panel title={t("Analytics · canonical Core read model")}>
      {analyticsError?<div className="notice">{t(String(analyticsError))}</div>:
      !analytics?<div className="emptyLine">{t("Loading canonical analytics…")}</div>:
      <div>
        <div className="compactRows">
          {analytics.kpisByCurrency.length===0?<div>
            <span>{legacyDate(analytics.period.from,locale,true)} → {legacyDate(analytics.period.to,locale,true)}</span>
            <b>{t("No materialized KPI rows yet")}</b>
            <small>{t("Projection status:")}{' '}{t(String(analytics.freshness.projectionStatus))}</small>
          </div>:
          analytics.kpisByCurrency.map(kpi=><div key={kpi.currency}>
            <span>{kpi.currency} · {legacyDate(analytics.period.from,locale,true)} → {legacyDate(analytics.period.to,locale,true)}</span>
            <b>{t("Occupancy")}{' '}{percent(kpi.occupancy,locale)} {' '}{t("· ADR")}{' '}{minorUnits(kpi.adrMinor,locale)} {' '}{t("minor · RevPAR")}{' '}{minorUnits(kpi.revparMinor,locale)} {' '}{t("minor")}</b>
            <small>
              {t("Gross")}{' '}{minorUnits(kpi.grossRevenueMinor,locale)} {' '}{t("minor · Net")}{' '}{minorUnits(kpi.netRevenueMinor,locale)} {' '}{t("minor ·")}{' '}{" "}{t("Bookings")}{' '}{kpi.bookingCount} {' '}{t("· Properties")}{' '}{kpi.propertyCount}
            </small>
            <i className={"status "+(analytics.freshness.projectionStatus==="healthy"?"ready":"waiting")}>
              {t(String(analytics.freshness.projectionStatus))}
            </i>
          </div>)}
        </div>
        <div className="emptyLine">
          {t("Core projection · pending events")}{' '}{analytics.freshness.pendingEvents} ·
          {" "}{t("scope properties")}{' '}{analytics.freshness.scopePropertyCount} ·
          {" "}{t("cache")}{' '}{analytics.cache.hit?t("hit"):t("miss")}
        </div>
      </div>}
    </Panel>}

    {management(role)&&<div className="notice">
      {t("Operational panels use persisted Pages/D1 data. Occupancy, ADR, RevPAR and revenue above come only from the canonical PostgreSQL analytics projection through the server-side BFF.")}{' '}</div>}
  </div>;
}
