import {useLegacyStaffLocale} from './LegacyStaffLocale';
import {useEffect,useMemo,useState,useRef} from "react";
import {
  Bell,Building2,CalendarDays,Camera,CheckCircle2,ClipboardList,FileText,Gauge,Image as ImageIcon,
  Plus,RefreshCw,ShieldCheck,Sparkles,Users,WalletCards,Wrench
} from "lucide-react";
import type {LucideIcon} from "lucide-react";
import type {HospitalityRole,ServiceOrder} from "../../domain/types";
import {initialOrders} from "../../data/demo";
import {canSeeServiceOrder,roleNavigation} from "../../domain/rbac";
import {transitionServiceOrder} from "../../domain/workflows";
import {integrationCatalog} from "../../domain/integrations";
import {api} from "../../api/client";
import {HousekeepingLive,MaintenanceLive} from "./LiveOperations";
import {LiveFrontDesk} from "./LiveFrontDesk";
import {ExceptionsLive,OperationsOverviewLive,ShiftHandoverLive} from "./LiveOperationsControl";
import {ApartmentTimelineLive,Guest360Live,StayCardLive} from "./LiveGuestStay";
import {IntegrationHubLive,TeamWorkloadLive} from "./LiveTeamIntegrations";
import {LiveDashboard} from "./LiveDashboard";
import {LiveFinance} from "./LiveFinance";
import {Orders,OrderActions,UnifiedInbox} from "./StaffQueue";
import {StaffDialog} from "./StaffDialog";
import {queueOrders} from "./staff-queue";
import "./staff-canva.css";

const roles:HospitalityRole[]=["cleaner","concierge","technician","front_desk","general_manager","super_admin"];
const labels:Record<string,string>={
  overview:"Overview","my-tasks":"My Tasks",inbox:"Inbox",operations:"Operations","front-desk":"Front Desk",guests:"Guests CRM",
  housekeeping:"Housekeeping",maintenance:"Maintenance",host:"Host Desk",finance:"Finance",admin:"Admin",integrations:"Integrations",
  team:"Team",messages:"Messages",handover:"Shift Handover",exceptions:"Exceptions","stay-card":"Stay Card",timeline:"Apartment Timeline"
};
const iconFor=(id:string)=>id.includes("maintenance")?Wrench:id.includes("housekeeping")?Sparkles:id.includes("front")?CalendarDays:id==="guests"?Users:id==="finance"?WalletCards:id==="host"?Building2:id==="admin"||id==="integrations"?ShieldCheck:id==="inbox"?Bell:id==="overview"?Gauge:ClipboardList;

export function StaffApp({role,onRoleChange,allowRoleSwitch=true,live=false}:{role:HospitalityRole;onRoleChange:(r:HospitalityRole)=>void;allowRoleSwitch?:boolean;live?:boolean}){
  const {t,locale}=useLegacyStaffLocale();
  const [active,setActive]=useState(roleNavigation[role][0]);
  const [orders,setOrders]=useState<ServiceOrder[]>(live?[]:initialOrders);
  const [liveError,setLiveError]=useState("");
  const pendingActions=useRef(new Set<string>());
  const [mobileTab,setMobileTab]=useState<"none"|"tasks"|"detail"|"proof"|"create"|"notifications">("none");
  const [selectedOrder,setSelectedOrder]=useState<ServiceOrder|null>(null);
  const [proofBefore,setProofBefore]=useState(false);
  const [proofAfter,setProofAfter]=useState(false);
  const [hostStep,setHostStep]=useState(1);

  const userId=role==="cleaner"?"u-cleaner":role==="technician"?"u-tech":"u-manager";
  const visible=useMemo(()=>orders.filter(o=>canSeeServiceOrder(role,userId,o)),[orders,role,userId]);
  const nav=roleNavigation[role];
  const current=nav.includes(active)?active:nav[0];

  async function loadLiveOrders(){
    if(!live)return;
    try{
      const result=await api.serviceOrders("utower");
      setOrders(result.items.map(o=>({
        id:o.id,title:o.title,category:o.category as ServiceOrder["category"],status:o.status as ServiceOrder["status"],
        priority:o.priority as ServiceOrder["priority"],assigneeUserId:o.assigned_user_id,unit:o.unit_id,
        guestName:o.guest_id,slaMinutes:0,history:[],version:o.version
      })));
      setLiveError("");
    }catch(error){setLiveError(error instanceof Error?error.message:"Failed to load live tasks")}
  }
  useEffect(()=>{void loadLiveOrders()},[live,role]);

  const act=async(id:string,action:"accept"|"start"|"complete")=>{
    if(pendingActions.current.has(id))return;
    if(live){
      const order=orders.find(o=>o.id===id);if(!order)return;
      pendingActions.current.add(id);
      try{await api.serviceOrderAction({id,action,version:order.version??1});await loadLiveOrders()}
      catch(error){setLiveError(error instanceof Error?error.message:"Action failed")}
      finally{pendingActions.current.delete(id)}
      return;
    }
    setOrders(currentOrders=>currentOrders.map(o=>{
      if(o.id!==id)return o;
      try{const status=transitionServiceOrder(o.status,action);return {...o,status,assigneeUserId:o.assigneeUserId??userId,history:[...o.history,action]}}catch{return o}
    }));
  };

  const content=()=>{
    if(current==="overview")return live?<LiveDashboard role={role}/>:<Dashboard orders={visible} role={role} onOpen={o=>{setSelectedOrder(o);setMobileTab("detail")}}/>;
    if(current==="my-tasks")return <><div className="sectionHead"><div><small>{t("OPERATIONS QUEUE")}</small><h2>{t("My Tasks")}</h2></div></div><Orders orders={visible} act={act} onOpen={o=>{setSelectedOrder(o);setMobileTab("detail")}}/></>;
    if(current==="inbox")return <UnifiedInbox orders={visible} act={act} onOpen={o=>{setSelectedOrder(o);setMobileTab("detail")}}/>;
    if(current==="operations")return live?<OperationsOverviewLive/>:<Panel title={t("Operations")}><div className="notice">{t("Live operations data is available in the authenticated staging runtime.")}</div></Panel>;
    if(current==="front-desk")return live?<LiveFrontDesk role={role}/>:<FrontDesk/>;
    if(current==="guests")return live?<Guest360Live/>:<Guest360/>;
    if(current==="housekeeping")return live?<HousekeepingLive role={role}/>:<Housekeeping/>;
    if(current==="maintenance")return live?<MaintenanceLive role={role}/>:<Maintenance/>;
    if(current==="handover")return live?<ShiftHandoverLive/>:<ShiftHandover/>;
    if(current==="exceptions")return live?<ExceptionsLive/>:<ExceptionsPanel/>;
    if(current==="stay-card")return live?<StayCardLive/>:<StayCard/>;
    if(current==="timeline")return live?<ApartmentTimelineLive/>:<ApartmentTimeline/>;
    if(current==="host")return <HostDesk step={hostStep} setStep={setHostStep}/>;
    if(current==="finance")return live?<LiveFinance/>:<Finance/>;
    if(current==="admin")return <AdminPanel orders={orders} act={act}/>;
    if(current==="integrations")return live?<IntegrationHubLive/>:<IntegrationHub/>;
    if(current==="team")return live?<TeamWorkloadLive role={role}/>:<TeamPanel orders={orders}/>;
    return <Panel title={labels[current]??current}><div className="notice">{t("Module foundation ready for the next backend slice.")}</div></Panel>;
  };

  return <div className="staffLayout canvaStaff">
    <aside className="sidebar"><div className="sideBrand">VIEWS <small>{t("OPERATIONS")}</small></div><nav aria-label={t("Staff sections")}>{nav.map(id=>{const Icon=iconFor(id);return <button className={current===id?"active":""} key={id} aria-label={t(labels[id]??id)} onClick={()=>setActive(id)}><Icon size={17}/><span>{t(String(labels[id]??id))}</span></button>})}</nav></aside>
    <main className="staffMain">
      <header className="staffHead" data-testid="staff-header"><div><small>{t("VIEWS OPERATIONS")}</small><h1>{t(String(labels[current]??current))}</h1></div>{allowRoleSwitch?<select aria-label={t("Demo staff role")} value={role} onChange={e=>{const next=e.target.value as HospitalityRole;onRoleChange(next);setActive(roleNavigation[next][0])}}>{roles.map(r=><option key={r} value={r}>{t(String(r.replace(/_/g," ")))}</option>)}</select>:<span className="roleLock">{t(String(role.replace(/_/g," ")))}</span>}</header>
      <div className={"staffMode "+(live?"live":"demo")} role="note"><span/>{live?t("Connected workspace"):t("Demo workspace · sample data; changes are not saved")}</div>
      {liveError&&<div className="notice" role="alert">{t(String(liveError))}<button onClick={()=>void loadLiveOrders()}>{t("Refresh")}</button></div>}
      {content()}
    </main>
    <StaffMobileDock tab={mobileTab} setTab={setMobileTab}/>
    <StaffMobileSheet error={liveError} tab={mobileTab} setTab={setMobileTab} orders={visible} selected={visible.find(o=>o.id===selectedOrder?.id)??null} setSelected={setSelectedOrder} act={act} proofBefore={proofBefore} proofAfter={proofAfter} setProofBefore={setProofBefore} setProofAfter={setProofAfter} live={live} role={role} onLiveCreated={loadLiveOrders}/>
  </div>;
}

function Dashboard({orders,role,onOpen}:{orders:ServiceOrder[];role:HospitalityRole;onOpen:(order:ServiceOrder)=>void}){
  const {t,locale}=useLegacyStaffLocale();
  return <>
    <div className="staffWelcome"><div><small>{t("OPERATIONS QUEUE")}</small><h2>{t("Your shift at a glance")}</h2><p>{t("Requests visible to your role, with priority and next actions.")}</p></div><span className="roleLock">{t(String(role.replace(/_/g," ")))}</span></div>
    <section className="kpis" data-testid="staff-task-kpis"><article><span>{t("Open Requests")}</span><b>{queueOrders(orders,"open").length}</b></article><article><span>{t("In Progress")}</span><b>{queueOrders(orders,"progress").length}</b></article><article><span>{t("Unassigned")}</span><b>{queueOrders(orders,"open").filter(o=>!o.assigneeUserId).length}</b></article><article><span>{t("Resolved")}</span><b>{queueOrders(orders,"resolved").length}</b></article></section>
    <div className="staffBoard">
      <Panel title={t("Today's tasks")}><div className="compactRows">{orders.slice(0,5).map(o=><button className="staffTaskPreview" key={o.id} onClick={()=>onOpen(o)}><span className={"orderPriority "+o.priority}>{t(o.priority)}</span><b>{o.title}</b><small>{o.unit?t("Apartment {unit}",{unit:o.unit}):t("Operational task")}</small><i className={"status "+o.status}>{t(String(o.status.replace(/_/g," ")))}</i></button>)}</div></Panel>
      <Panel title={t("Schedule / Calendar")}><div className="timelineBoard"><div className="timelineHeader"><span>{t("12 Oct")}</span><span>{t("13 Oct")}</span><span>{t("14 Oct")}</span><span>{t("15 Oct")}</span></div><div className="timelineRow"><b>U-Tower #235</b><i className="bar guest">{t("Guest stay")}</i></div><div className="timelineRow"><b>Nest One #12</b><i className="bar cleaning">{t("Cleaning")}</i></div><div className="timelineRow"><b>Gardens #14</b><i className="bar maintenance">{t("Maintenance")}</i></div></div></Panel>
    </div>
  </>;
}

function FrontDesk(){
  const {t,locale}=useLegacyStaffLocale();
  return <div className="staffBoard">
    <Panel title={t("Reservations")}><div className="compactRows">{["Alex Johnson","Sarah Miller","David Kim"].map((n,i)=><div key={n}><span>{i===0?t("12–15 Oct"):t("Upcoming")}</span><b>{n}</b><small>{i===0?"U-Tower #235":t("VIEWS apartment")}</small><i className={"status "+(i===0?"confirmed":"assigned")}>{i===0?t("confirmed"):t("request")}</i></div>)}</div></Panel>
    <Panel title={t("Immigration registration queue")}><div className="compactRows">{["John Smith (USA)","Maria Garcia (Spain)","Chen Wei (China)"].map((n,i)=><div key={n}><span>{i===0?t("New"):t("Pending")}</span><b>{n}</b><small>{t("Passport data + stay details")}</small><i className={"status "+(i===2?"done":"assigned")}>{i===2?t("sent"):t("waiting")}</i></div>)}</div></Panel>
  </div>;
}

function Guest360(){
  const {t,locale}=useLegacyStaffLocale();
  return <div className="guest360"><div className="guestCard"><div className="avatarBig">AJ</div><div><small>GUEST360</small><h2>Alex Johnson</h2><p>alex.johnson@email.com · +998 90 123 45 67</p></div></div><div className="guest360Grid"><Panel title={t("Documents")}><div className="detailRows"><span>{t("Passport")}<b>{t("Verified")}</b></span><span>{t("Registration")}<b>{t("Ready for submission")}</b></span><span>{t("Nationality")}<b>USA</b></span></div></Panel><Panel title={t("Stay history")}><div className="compactRows"><div><span>{t("Current")}</span><b>U-Tower #235</b><small>{t("12–15 Oct")}</small></div><div><span>{t("Previous")}</span><b>{t("VIEWS apartment")}</b><small>{t("Completed")}</small></div></div></Panel></div></div>;
}

function Housekeeping(){
  const {t,locale}=useLegacyStaffLocale();
  return <Panel title={t("Housekeeping workflow")}><div className="workflow"><span><b>{t("occupied")}</b></span><span><i>→</i><b>{t("checkout_due")}</b></span><span><i>→</i><b>{t("dirty")}</b></span><span><i>→</i><b>{t("cleaning")}</b></span><span><i>→</i><b>{t("inspection")}</b></span><span><i>→</i><b>{t("ready")}</b></span></div><div className="proofGrid"><article><Camera/><b>{t("Before photo")}</b><small>{t("Proof placeholder")}</small></article><article><CheckCircle2/><b>{t("Inspection")}</b><small>{t("Supervisor verification")}</small></article><article><ImageIcon/><b>{t("After photo")}</b><small>{t("Proof placeholder")}</small></article></div></Panel>;
}

function Maintenance(){
  const {t,locale}=useLegacyStaffLocale();
  return <Panel title={t("Maintenance")}><div className="workflow"><span><b>{t("open")}</b></span><span><i>→</i><b>{t("in_progress")}</b></span><span><i>→</i><b>{t("waiting / blocked")}</b></span><span><i>→</i><b>{t("inspection")}</b></span><span><i>→</i><b>{t("closed")}</b></span></div><div className="notice">{t("Technician sees only assigned maintenance work; managers see the full queue and exceptions.")}</div></Panel>;
}

function ShiftHandover(){
  const {t,locale}=useLegacyStaffLocale();
  return <div className="handoverGrid">
    <Panel title={t("Unresolved Requests")}><div className="riskList"><article><b>{t("Late check-out approval")}</b><span>{t("Room 412 · pending assignment")}</span></article><article><b>{t("Laundry pickup overdue")}</b><span>{t("Unit 208 · 45 min overdue")}</span></article><article><b>{t("Maintenance unacknowledged")}</b><span>{t("Suite 305 · since 14:30")}</span></article></div></Panel>
    <Panel title={t("Overdue SLAs")}><div className="riskList"><article className="dangerRow"><b>{t("Concierge taxi booking")}</b><span>{t("SLA 30 min · elapsed 52 min")}</span></article><article className="dangerRow"><b>{t("Housekeeping inspection")}</b><span>{t("Unit 110 · SLA breached")}</span></article></div></Panel>
    <Panel title={t("Risky Operational Items")}><div className="riskList"><article><b>{t("VIP noise complaint")}</b><span>{t("Apt 501 · unresolved")}</span></article><article><b>{t("DND active")}</b><span>{t("Unit 307 · cleaning not completed")}</span></article><article><b>{t("Early arrival")}</b><span>{t("Booking #8821 · room not ready")}</span></article></div></Panel>
    <Panel title={t("Required Follow-Up")}><div className="riskList"><article><b>{t("Minibar restock")}</b><span>{t("Apt 202")}</span></article><article><b>{t("Lost phone charger")}</b><span>{t("Apt 318")}</span></article><article><b>{t("Late checkout authorization")}</b><span>{t("Unit 415")}</span></article></div></Panel>
  </div>;
}

function ExceptionsPanel(){
  const {t,locale}=useLegacyStaffLocale();
  return <div className="exceptionsGrid">
    <section className="kpis"><article><span>{t("Lost & Found")}</span><b>2</b></article><article><span>{t("Damage reports")}</span><b>1</b></article><article><span>{t("Low-stock SKUs")}</span><b>4</b></article><article><span>{t("SLA breaches")}</span><b>2</b></article></section>
    <Panel title={t("Lost & Found")}><div className="compactRows"><div><span>{t("Pending")}</span><b>{t("Phone charger")}</b><small>{t("Apt 318 · found after checkout")}</small><i className="status assigned">{t("pending")}</i></div><div><span>{t("Claimed")}</span><b>{t("Black scarf")}</b><small>{t("Lobby")}</small><i className="status done">{t("claimed")}</i></div></div></Panel>
    <Panel title={t("Damage Reports")}><div className="compactRows"><div><span>{t("High")}</span><b>{t("Door lock damage")}</b><small>{t("Apt 207 · estimate pending")}</small><i className="status assigned">{t("review")}</i></div></div></Panel>
    <Panel title={t("Minimum Inventory Alerts")}><div className="compactRows"><div><span>12 / 30</span><b>{t("Toiletries")}</b><small>{t("Below par level")}</small><i className="status assigned">{t("reorder")}</i></div><div><span>8 / 20</span><b>{t("Bed linen")}</b><small>{t("Below par level")}</small><i className="status assigned">{t("reorder")}</i></div></div></Panel>
  </div>;
}

function StayCard(){
  const {t,locale}=useLegacyStaffLocale();
  return <div className="stayCard">
    <header><div className="avatarBig">MS</div><div><small>{t("STAY CARD")}</small><h2>Maria Santos · VIP Gold</h2><p>{t("Apt 304 · Studio Deluxe · active stay")}</p></div><span className="status done">{t("cleared")}</span></header>
    <div className="stayGrid">
      <Panel title={t("Guest & Booking")}><div className="detailRows"><span>{t("Check-in")}<b>{t("14 Jan")}</b></span><span>{t("Check-out")}<b>{t("21 Jan")}</b></span><span>{t("Booking")}<b>#VW-2024-0841</b></span><span>{t("Rate")}<b>{t("Live booking data")}</b></span><span>{t("Balance")}<b>{t("Provider-backed")}</b></span></div></Panel>
      <Panel title={t("Services & Operations")}><div className="detailRows"><span>{t("Housekeeping")}<b>{t("Cleaned 13:42")}</b></span><span>{t("DND")}<b>{t("No")}</b></span><span>{t("Maintenance")}<b>{t("1 open ticket")}</b></span><span>{t("Service Orders")}<b>{t("2 active")}</b></span><span>{t("Last interaction")}<b>{t("Front Desk 09:15")}</b></span></div></Panel>
    </div>
  </div>;
}

function ApartmentTimeline(){
  const {t,locale}=useLegacyStaffLocale();
  const events=[["09:15","Front Desk","Guest interaction"],["10:00","Housekeeping","Cleaning started"],["11:22","Maintenance","AC ticket opened"],["13:42","Housekeeping","Cleaning completed"],["14:05","Inspection","Room ready"]];
  return <Panel title={t("Apartment Timeline")}><div className="apartmentTimeline">{events.map(([time,type,text])=><article key={time+type}><time>{time}</time><span/><div><b>{t(String(type))}</b><small>{t(String(text))}</small></div></article>)}</div><div className="notice">{t("Timeline unifies bookings, check-in/out, housekeeping, maintenance and service orders for one apartment.")}</div></Panel>;
}

function HostDesk({step,setStep}:{step:number;setStep:(n:number)=>void}){
  const {t,locale}=useLegacyStaffLocale();
  return <div className="hostDesk">
    <div className="hostTabs">{["Listing wizard","Calendar & pricing","Bookings","Calendar sync","Host finance"].map((x,i)=><button className={step===i+1?"active":""} key={x} onClick={()=>setStep(i+1)}>{t(String(x))}</button>)}</div>
    {step===1&&<Panel title={t("Listing wizard")}><div className="wizardSteps"><span className="on">{t("1 Basics")}</span><span>{t("2 Photos")}</span><span>{t("3 Amenities")}</span><span>{t("4 Prices")}</span><span>{t("5 Rules")}</span></div><div className="hostForm"><label>{t("Property name")}<input placeholder={t("VIEWS apartment")}/></label><label>{t("Address")}<input value="Tashkent, NRG U-Tower" readOnly/></label><label>{t("Type")}<select><option>{t("Apartment")}</option></select></label><button className="primary" disabled title={t("Listing creation uses the owner workspace connected to Core.")}>{t("Next")}</button></div></Panel>}
    {step===2&&<Panel title={t("Calendar & pricing")}><div className="calendarGrid">{Array.from({length:31},(_,i)=><span key={i} className={[5,6,12,13,14].includes(i)?"booked":[19,20].includes(i)?"blocked":""}>{i+1}</span>)}</div><div className="calendarLegend"><span className="available">{t("Available")}</span><span className="booked">{t("Booked")}</span><span className="blocked">{t("Blocked")}</span></div></Panel>}
    {step===3&&<Panel title={t("Bookings")}><div className="compactRows">{["Alex Johnson","Sarah Miller","David Kim"].map((n,i)=><div key={n}><span>{i===0?t("12–15 Oct"):t("Upcoming")}</span><b>{n}</b><small>{t("Live amount comes from booking source")}</small><i className={"status "+(i===2?"cancelled":"confirmed")}>{i===2?t("cancelled"):t("confirmed")}</i></div>)}</div></Panel>}
    {step===4&&<Panel title={t("Calendar sync")}><div className="syncCard"><RefreshCw/><div><b>{t("iCal / OTA synchronization")}</b><p>{t("Airbnb / Booking.com connectors appear here after partner authorization. No sync state is fabricated.")}</p></div><span className="status assigned">{t("not connected")}</span></div></Panel>}
    {step===5&&<Panel title={t("Host finance")}><section className="kpis"><article><span>{t("Gross revenue")}</span><b>—</b></article><article><span>{t("Paid out")}</span><b>—</b></article><article><span>{t("Commission")}</span><b>—</b></article><article><span>{t("Pending")}</span><b>—</b></article></section><div className="notice">{t("Financial values remain unavailable until backed by live captured transactions.")}</div></Panel>}
  </div>;
}

function Finance(){
  const {t,locale}=useLegacyStaffLocale();
  return <div className="staffBoard"><Panel title={t("Finance & invoices")}><div className="compactRows"><div><span>{t("Payment")}</span><b>{t("Booking invoice")}</b><small>{t("Live data required")}</small><i className="status assigned">{t("pending")}</i></div><div><span>{t("Refund")}</span><b>{t("Cancellation refund")}</b><small>{t("Exact policy calculation required")}</small><i className="status assigned">{t("review")}</i></div></div></Panel><Panel title={t("Financial controls")}><div className="notice">{t("No financial KPIs are invented. Revenue, ADR, RevPAR and balances are rendered only from persisted transactions.")}</div></Panel></div>;
}

function AdminPanel({orders,act}:{orders:ServiceOrder[];act:(id:string,a:"accept"|"start"|"complete")=>void|Promise<void>}){
  const {t,locale}=useLegacyStaffLocale();
  return <div className="adminGrid"><Panel title={t("Object moderation")}><div className="compactRows">{["Sunrise Apartments","City Loft","Urban Garden"].map((n,i)=><div key={n}><span>{i===0?t("Pending"):t("Published")}</span><b>{n}</b><small>{t("Listing quality / content check")}</small><i className={"status "+(i===0?"assigned":"done")}>{i===0?t("review"):t("active")}</i></div>)}</div></Panel><Panel title={t("Disputes & refunds")}><div className="compactRows"><div><span>{t("Case")}</span><b>{t("Cancellation dispute")}</b><small>{t("Awaiting evidence")}</small><i className="status assigned">{t("open")}</i></div><div><span>{t("Refund")}</span><b>{t("Booking adjustment")}</b><small>{t("Provider-backed calculation required")}</small><i className="status assigned">{t("review")}</i></div></div></Panel><Panel title={t("All service orders")}><Orders orders={orders} act={act}/></Panel></div>;
}

function IntegrationHub(){
  const {t,locale}=useLegacyStaffLocale();
  return <Panel title={t("Integration Hub")}><div className="integrationGrid">{integrationCatalog.map(item=><article className="integrationCard" key={item.provider}><div><b>{t(String(item.label))}</b><span>{item.capabilities.map(code=>t(code.replace(/_/g," "))).join(" · ")}</span></div><span className={"status "+(item.status==="configured"?"done":"assigned")}>{t(String(item.status.replace(/_/g," ")))}</span></article>)}</div><div className="notice">{t("Credentials are never stored in this UI, browser storage or GitHub. Live secrets are added only to the deployment secret store.")}</div></Panel>;
}

function TeamPanel({orders}:{orders:ServiceOrder[]}){
  const {t,locale}=useLegacyStaffLocale();
  const staff=[["Nargiza","Housekeeping",3,5],["Rustam","Maintenance",2,3],["Malika","Concierge",4,7],["Bekzod","Front Desk",2,6]];
  return <div className="teamWorkload"><section className="kpis"><article><span>{t("On shift")}</span><b>{staff.length}</b></article><article><span>{t("Active tasks")}</span><b>{orders.filter(o=>o.status!=="done").length}</b></article><article><span>{t("Unassigned")}</span><b>{orders.filter(o=>!o.assigneeUserId).length}</b></article><article><span>{t("Overdue SLA")}</span><b>0</b></article></section><Panel title={t("Staff Workload")}><div className="workloadGrid">{staff.map(([name,role,active,done])=><article key={String(name)}><div><b>{name}</b><small>{t(String(role))}</small></div><span>{t("Active")}{' '}<strong>{active}</strong></span><span>{t("Done")}{' '}<strong>{done}</strong></span><i className={Number(active)>=4?"busy":"available"}>{Number(active)>=4?t("busy"):t("available")}</i><button disabled title={t("Assignment requires a connected staff account.")}>{t("Reassign")}</button></article>)}</div></Panel></div>;
}

function creatableCategories(role:HospitalityRole){
  if(role==="front_desk")return ["reservation_front_desk","concierge"] as const;
  if(role==="housekeeping_supervisor")return ["cleaning"] as const;
  if(role==="maintenance_manager")return ["maintenance"] as const;
  if(role==="general_manager"||role==="super_admin")return ["concierge","cleaning","maintenance","reservation_front_desk"] as const;
  return [] as const;
}

function MobileCreateTask({live,role,onCreated}:{live:boolean;role:HospitalityRole;onCreated:()=>Promise<void>}){
  const {t,locale}=useLegacyStaffLocale();
  const categories=creatableCategories(role);
  const [category,setCategory]=useState<string>(categories[0]??"");
  const [title,setTitle]=useState("");
  const [priority,setPriority]=useState("normal");
  const [message,setMessage]=useState("");
  const [busy,setBusy]=useState(false);

  useEffect(()=>{setCategory(categories[0]??"")},[role]);

  async function submit(){
    if(!live){setMessage("Task creation is available in live staging runtime.");return}
    if(!category||title.trim().length<2){setMessage("Choose a task type and enter a description.");return}
    setBusy(true);setMessage("");
    try{
      const key="mobile-"+crypto.randomUUID();
      const result=await api.createServiceOrder({propertyId:"utower",category,title:title.trim(),priority},key);
      setTitle("");
      setMessage("Created: "+result.id);
      await onCreated();
    }catch(error){setMessage(error instanceof Error?error.message:"Create failed")}
    finally{setBusy(false)}
  }

  return <div><h3>{t("Create task")}</h3>{!live&&<p className="notice">{t("Task creation is available in live staging runtime.")}</p>}{categories.length===0?<div className="notice">{t("This role cannot create operational tasks.")}</div>:<div className="mobileCreate">
    <label>{t("Type")}<select value={category} onChange={e=>setCategory(e.target.value)}>{categories.map(x=><option key={x} value={x}>{t(String(x.replace(/_/g," ")))}</option>)}</select></label>
    <label>{t("Description")}<textarea value={title} onChange={e=>setTitle(e.target.value)} placeholder={t("What needs to be done?")}/></label>
    <label>{t("Priority")}<select value={priority} onChange={e=>setPriority(e.target.value)}><option value="low">{t("Low")}</option><option value="normal">{t("Normal")}</option><option value="high">{t("High")}</option><option value="urgent">{t("Urgent")}</option></select></label>
    <button className="primary" disabled={busy||!live} onClick={submit}>{busy?t("Creating…"):t("Create")}</button>
    {message&&<div className="notice">{message.startsWith("Created: ")?t("Created: {id}",{id:message.slice(9)}):t(message)}</div>}
  </div>}</div>;
}

function Panel({title,children}:{title:string;children:React.ReactNode}){
  const {t,locale}=useLegacyStaffLocale();return <section className="panel"><header><small>{t("VIEWS CRM")}</small><h2>{t(String(title))}</h2></header>{children}</section>}

function StaffMobileDock({tab,setTab}:{tab:string;setTab:(t:any)=>void}){
  const {t,locale}=useLegacyStaffLocale();
  const items:[string,LucideIcon][]=[["tasks",ClipboardList],["detail",FileText],["proof",Camera],["create",Plus],["notifications",Bell]];
  return <nav className="staffMobileDock" aria-label={t("Mobile staff sections")}>{items.map(([id,Icon])=><button key={id} className={tab===id?"active":""} aria-expanded={tab===id} onClick={()=>setTab(tab===id?"none":id)}><Icon size={17}/><span>{t(String(id))}</span></button>)}</nav>;
}

function StaffMobileSheet({error,tab,setTab,orders,selected,setSelected,act,proofBefore,proofAfter,setProofBefore,setProofAfter,live,role,onLiveCreated}:{error:string;tab:string;setTab:(t:any)=>void;orders:ServiceOrder[];selected:ServiceOrder|null;setSelected:(o:ServiceOrder|null)=>void;act:(id:string,a:"accept"|"start"|"complete")=>void|Promise<void>;proofBefore:boolean;proofAfter:boolean;setProofBefore:(v:boolean)=>void;setProofAfter:(v:boolean)=>void;live:boolean;role:HospitalityRole;onLiveCreated:()=>Promise<void>}){
  const {t,locale}=useLegacyStaffLocale();
  if(tab==="none")return null;
  return <StaffDialog onClose={()=>setTab("none")}>
    {error&&<div className="notice" role="alert">{t(String(error))}</div>}
    {tab==="tasks"&&<div><h3>{t("My Tasks")}</h3>{orders.map(o=><button className="mobileTask" key={o.id} onClick={()=>{setSelected(o);setTab("detail")}}><span>{o.title}</span><i className={"status "+o.status}>{t(String(o.status))}</i></button>)}</div>}
    {tab==="detail"&&<div data-testid="staff-order-detail"><small>{t("Service Orders")}</small><h3>{t("Task detail")}</h3>{selected?<><div className="mobileDetail"><span className={"status "+selected.status}>{t(selected.status.replace(/_/g," "))}</span><h2>{selected.title}</h2><dl className="staffOrderFacts"><div><dt>{t("Apartment")}</dt><dd>{selected.unit??"—"}</dd></div><div><dt>{t("Category")}</dt><dd>{t(selected.category.replace(/_/g," "))}</dd></div><div><dt>{t("Priority")}</dt><dd className={"orderPriority "+selected.priority}>{t(selected.priority)}</dd></div><div><dt>{t("Guest")}</dt><dd>{selected.guestName??t("No guest")}</dd></div><div><dt>{t("Assignee")}</dt><dd>{selected.assigneeUserId??t("Unassigned")}</dd></div><div><dt>SLA</dt><dd>{selected.slaMinutes?selected.slaMinutes+" "+t("min"):t("Not available")}</dd></div></dl></div><OrderActions order={selected} act={act}/><section className="staffOrderActivity"><h4>{t("Activity")}</h4>{selected.history.length?<ol>{selected.history.map((event,index)=><li key={index}>{t(event)}</li>)}</ol>:<p>{t("No activity history is available in this view.")}</p>}</section><p className="notice">{t("Comments, reassignment and photo uploads are not connected in this view.")}</p></>:<p>{t("Select a task.")}</p>}</div>}

    {tab==="proof"&&<div><h3>{t("Before / after proof")}</h3><p role="status">{t("Photo uploads are not connected in this preview.")}</p><div className="mobileProof"><button className={proofBefore?"done":""} disabled><Camera/><b>{t("Before")}</b><small>{proofBefore?t("Captured"):t("Capture photo")}</small></button><button className={proofAfter?"done":""} disabled><ImageIcon/><b>{t("After")}</b><small>{proofAfter?t("Captured"):t("Capture photo")}</small></button></div></div>}
    {tab==="create"&&<MobileCreateTask live={live} role={role} onCreated={onLiveCreated}/>}
    {tab==="notifications"&&<div><h3>{t("Notifications")}</h3><p className="notice">{t("A live notification feed is not connected in this view.")}</p></div>}
  </StaffDialog>;
}
