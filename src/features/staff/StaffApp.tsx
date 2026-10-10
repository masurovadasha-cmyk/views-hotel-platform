import {CanvaDispatcherQueue} from "./CanvaDispatcherQueue";
import {CanvaAdminServiceCatalog} from "./CanvaAdminServiceCatalog";
import {RangeCalendar,nightsBetween} from "../../components/RangeCalendar";
import {useEffect,useMemo,useState} from "react";
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

const roles:HospitalityRole[]=["cleaner","concierge","technician","front_desk","general_manager","super_admin"];
const labels:Record<string,string>={
  overview:"Overview","my-tasks":"My Tasks",inbox:"Inbox",operations:"Operations","front-desk":"Front Desk",guests:"Guests CRM",
  housekeeping:"Housekeeping",maintenance:"Maintenance",host:"Host Desk",finance:"Finance",admin:"Admin",integrations:"Integrations",
  team:"Team",messages:"Messages",handover:"Shift Handover",exceptions:"Exceptions","stay-card":"Stay Card",timeline:"Apartment Timeline"
};
const iconFor=(id:string)=>id.includes("maintenance")?Wrench:id.includes("housekeeping")?Sparkles:id.includes("front")?CalendarDays:id==="guests"?Users:id==="finance"?WalletCards:id==="host"?Building2:id==="admin"||id==="integrations"?ShieldCheck:id==="inbox"?Bell:id==="overview"?Gauge:ClipboardList;

export function StaffApp({role,onRoleChange,allowRoleSwitch=true,live=false}:{role:HospitalityRole;onRoleChange:(r:HospitalityRole)=>void;allowRoleSwitch?:boolean;live?:boolean}){
  const [active,setActive]=useState(roleNavigation[role][0]);
  const [calendarOpen,setCalendarOpen]=useState(false);
  const [periodStart,setPeriodStart]=useState("");
  const [periodEnd,setPeriodEnd]=useState("");
  const [orders,setOrders]=useState<ServiceOrder[]>(live?[]:initialOrders);
  const [liveError,setLiveError]=useState("");
  const [mobileTab,setMobileTab]=useState<"tasks"|"detail"|"proof"|"create"|"notifications">("tasks");
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
    if(live){
      const order=orders.find(o=>o.id===id);if(!order)return;
      try{await api.serviceOrderAction({id,action,version:order.version??1});await loadLiveOrders()}
      catch(error){setLiveError(error instanceof Error?error.message:"Action failed")}
      return;
    }
    setOrders(currentOrders=>currentOrders.map(o=>{
      if(o.id!==id)return o;
      try{const status=transitionServiceOrder(o.status,action);return {...o,status,assigneeUserId:o.assigneeUserId??userId,history:[...o.history,action]}}catch{return o}
    }));
  };

  const content=()=>{
    if(current==="overview")return live?<LiveDashboard role={role}/>:<Dashboard orders={visible} role={role}/>;
    if(current==="my-tasks")return <><div className="sectionHead"><div><small>OPERATIONS QUEUE</small><h2>My Tasks</h2></div></div>{liveError&&<div className="notice">{liveError}</div>}<Orders orders={visible} act={act} onOpen={o=>{setSelectedOrder(o);setMobileTab("detail")}}/></>;
    if(current==="inbox")return <UnifiedInbox orders={visible} act={act} onOpen={o=>{setSelectedOrder(o);setMobileTab("detail")}}/>;
    if(current==="operations")return <><CanvaDispatcherQueue orders={visible} live={live}/>{live?<OperationsOverviewLive/>:<Panel title="Operations"><div className="notice">Live operations data is available in the authenticated staging runtime.</div></Panel>}</>;
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
    if(current==="admin")return <><CanvaAdminServiceCatalog/><AdminPanel orders={orders} act={act}/></>;
    if(current==="integrations")return live?<IntegrationHubLive/>:<IntegrationHub/>;
    if(current==="team")return live?<TeamWorkloadLive role={role}/>:<TeamPanel orders={orders}/>;
    return <Panel title={labels[current]??current}><div className="notice">Module foundation ready for the next backend slice.</div></Panel>;
  };

  return <div className="staffLayout">\n    {calendarOpen&&<RangeCalendar start={periodStart} end={periodEnd} onApply={(start,end)=>{setPeriodStart(start);setPeriodEnd(end)}} onClose={()=>setCalendarOpen(false)}/>}
    <aside className="sidebar"><div className="sideBrand">VIEWS <small>OPERATIONS</small></div><nav>{nav.map(id=>{const Icon=iconFor(id);return <button className={current===id?"active":""} key={id} onClick={()=>setActive(id)}><Icon size={17}/><span>{labels[id]??id}</span></button>})}</nav></aside>
    <main className="staffMain">
      <header className="staffHead"><div><small>VIEWS OPERATIONS</small><h1>{labels[current]??current}</h1></div>{allowRoleSwitch?<select value={role} onChange={e=>{const next=e.target.value as HospitalityRole;onRoleChange(next);setActive(roleNavigation[next][0])}}>{roles.map(r=><option key={r} value={r}>{r.replaceAll("_"," ")}</option>)}</select>:<span className="roleLock">{role.replaceAll("_"," ")}</span>}</header>
      <div className="staffPlanningRange"><button type="button" onClick={()=>setCalendarOpen(true)}><CalendarDays size={16}/> Период планирования: {periodStart&&periodEnd?periodStart+" — "+periodEnd+" ("+nightsBetween(periodStart,periodEnd)+" ночей)":"Выбрать даты"}</button><small>Демо-период · не фильтрует серверные заказы</small></div>\n      {content()}\n    </main>
    <StaffMobileDock tab={mobileTab} setTab={setMobileTab}/>
    <StaffMobileSheet tab={mobileTab} setTab={setMobileTab} orders={visible} selected={selectedOrder} setSelected={setSelectedOrder} act={act} proofBefore={proofBefore} proofAfter={proofAfter} setProofBefore={setProofBefore} setProofAfter={setProofAfter} live={live} role={role} onLiveCreated={loadLiveOrders}/>
  </div>;
}

function Dashboard({orders,role}:{orders:ServiceOrder[];role:HospitalityRole}){
  return <>
    <section className="kpis"><article><span>Tasks today</span><b>{orders.length}</b></article><article><span>Check-ins</span><b>0</b></article><article><span>Open SLA</span><b>{orders.filter(o=>o.status!=="done").length}</b></article><article><span>Role</span><b>{role.replaceAll("_"," ")}</b></article></section>
    <div className="staffBoard">
      <Panel title="Today's tasks"><div className="compactRows">{orders.slice(0,5).map(o=><div key={o.id}><span>10:00</span><b>{o.title}</b><small>{o.unit?"Apt "+o.unit:"Operational task"}</small><i className={"status "+o.status}>{o.status.replaceAll("_"," ")}</i></div>)}</div></Panel>
      <Panel title="Schedule / Calendar"><div className="timelineBoard"><div className="timelineHeader"><span>12 Oct</span><span>13 Oct</span><span>14 Oct</span><span>15 Oct</span></div><div className="timelineRow"><b>U-Tower #235</b><i className="bar guest">Guest stay</i></div><div className="timelineRow"><b>Nest One #12</b><i className="bar cleaning">Cleaning</i></div><div className="timelineRow"><b>Gardens #14</b><i className="bar maintenance">Maintenance</i></div></div></Panel>
    </div>
  </>;
}

function FrontDesk(){
  return <div className="staffBoard">
    <Panel title="Reservations"><div className="compactRows">{["Alex Johnson","Sarah Miller","David Kim"].map((n,i)=><div key={n}><span>{i===0?"12–15 Oct":"Upcoming"}</span><b>{n}</b><small>{i===0?"U-Tower #235":"VIEWS apartment"}</small><i className={"status "+(i===0?"confirmed":"assigned")}>{i===0?"confirmed":"request"}</i></div>)}</div></Panel>
    <Panel title="Immigration registration queue"><div className="compactRows">{["John Smith (USA)","Maria Garcia (Spain)","Chen Wei (China)"].map((n,i)=><div key={n}><span>{i===0?"New":"Pending"}</span><b>{n}</b><small>Passport data + stay details</small><i className={"status "+(i===2?"done":"assigned")}>{i===2?"sent":"waiting"}</i></div>)}</div></Panel>
  </div>;
}

function Guest360(){
  return <div className="guest360"><div className="guestCard"><div className="avatarBig">AJ</div><div><small>GUEST360</small><h2>Alex Johnson</h2><p>alex.johnson@email.com · +998 90 123 45 67</p></div></div><div className="guest360Grid"><Panel title="Documents"><div className="detailRows"><span>Passport<b>Verified</b></span><span>Registration<b>Ready for submission</b></span><span>Nationality<b>USA</b></span></div></Panel><Panel title="Stay history"><div className="compactRows"><div><span>Current</span><b>U-Tower #235</b><small>12–15 Oct</small></div><div><span>Previous</span><b>VIEWS apartment</b><small>Completed</small></div></div></Panel></div></div>;
}

function Housekeeping(){
  return <Panel title="Housekeeping workflow"><div className="workflow"><span><b>occupied</b></span><span><i>→</i><b>checkout_due</b></span><span><i>→</i><b>dirty</b></span><span><i>→</i><b>cleaning</b></span><span><i>→</i><b>inspection</b></span><span><i>→</i><b>ready</b></span></div><div className="proofGrid"><article><Camera/><b>Before photo</b><small>Proof placeholder</small></article><article><CheckCircle2/><b>Inspection</b><small>Supervisor verification</small></article><article><ImageIcon/><b>After photo</b><small>Proof placeholder</small></article></div></Panel>;
}

function Maintenance(){
  return <Panel title="Maintenance"><div className="workflow"><span><b>open</b></span><span><i>→</i><b>in_progress</b></span><span><i>→</i><b>waiting / blocked</b></span><span><i>→</i><b>inspection</b></span><span><i>→</i><b>closed</b></span></div><div className="notice">Technician sees only assigned maintenance work; managers see the full queue and exceptions.</div></Panel>;
}

function ShiftHandover(){
  return <div className="handoverGrid">
    <Panel title="Unresolved Requests"><div className="riskList"><article><b>Late check-out approval</b><span>Room 412 · pending assignment</span></article><article><b>Laundry pickup overdue</b><span>Unit 208 · 45 min overdue</span></article><article><b>Maintenance unacknowledged</b><span>Suite 305 · since 14:30</span></article></div></Panel>
    <Panel title="Overdue SLAs"><div className="riskList"><article className="dangerRow"><b>Concierge taxi booking</b><span>SLA 30 min · elapsed 52 min</span></article><article className="dangerRow"><b>Housekeeping inspection</b><span>Unit 110 · SLA breached</span></article></div></Panel>
    <Panel title="Risky Operational Items"><div className="riskList"><article><b>VIP noise complaint</b><span>Apt 501 · unresolved</span></article><article><b>DND active</b><span>Unit 307 · cleaning not completed</span></article><article><b>Early arrival</b><span>Booking #8821 · room not ready</span></article></div></Panel>
    <Panel title="Required Follow-Up"><div className="riskList"><article><b>Minibar restock</b><span>Apt 202</span></article><article><b>Lost phone charger</b><span>Apt 318</span></article><article><b>Late checkout authorization</b><span>Unit 415</span></article></div></Panel>
  </div>;
}

function ExceptionsPanel(){
  return <div className="exceptionsGrid">
    <section className="kpis"><article><span>Lost & Found</span><b>2</b></article><article><span>Damage reports</span><b>1</b></article><article><span>Low-stock SKUs</span><b>4</b></article><article><span>SLA breaches</span><b>2</b></article></section>
    <Panel title="Lost & Found"><div className="compactRows"><div><span>Pending</span><b>Phone charger</b><small>Apt 318 · found after checkout</small><i className="status assigned">pending</i></div><div><span>Claimed</span><b>Black scarf</b><small>Lobby</small><i className="status done">claimed</i></div></div></Panel>
    <Panel title="Damage Reports"><div className="compactRows"><div><span>High</span><b>Door lock damage</b><small>Apt 207 · estimate pending</small><i className="status assigned">review</i></div></div></Panel>
    <Panel title="Minimum Inventory Alerts"><div className="compactRows"><div><span>12 / 30</span><b>Toiletries</b><small>Below par level</small><i className="status assigned">reorder</i></div><div><span>8 / 20</span><b>Bed linen</b><small>Below par level</small><i className="status assigned">reorder</i></div></div></Panel>
  </div>;
}

function StayCard(){
  return <div className="stayCard">
    <header><div className="avatarBig">MS</div><div><small>STAY CARD</small><h2>Maria Santos · VIP Gold</h2><p>Apt 304 · Studio Deluxe · active stay</p></div><span className="status done">cleared</span></header>
    <div className="stayGrid">
      <Panel title="Guest & Booking"><div className="detailRows"><span>Check-in<b>14 Jan</b></span><span>Check-out<b>21 Jan</b></span><span>Booking<b>#VW-2024-0841</b></span><span>Rate<b>Live booking data</b></span><span>Balance<b>Provider-backed</b></span></div></Panel>
      <Panel title="Services & Operations"><div className="detailRows"><span>Housekeeping<b>Cleaned 13:42</b></span><span>DND<b>No</b></span><span>Maintenance<b>1 open ticket</b></span><span>Service Orders<b>2 active</b></span><span>Last interaction<b>Front Desk 09:15</b></span></div></Panel>
    </div>
  </div>;
}

function ApartmentTimeline(){
  const events=[["09:15","Front Desk","Guest interaction"],["10:00","Housekeeping","Cleaning started"],["11:22","Maintenance","AC ticket opened"],["13:42","Housekeeping","Cleaning completed"],["14:05","Inspection","Room ready"]];
  return <Panel title="Apartment Timeline"><div className="apartmentTimeline">{events.map(([time,type,text])=><article key={time+type}><time>{time}</time><span/><div><b>{type}</b><small>{text}</small></div></article>)}</div><div className="notice">Timeline unifies bookings, check-in/out, housekeeping, maintenance and service orders for one apartment.</div></Panel>;
}

function HostDesk({step,setStep}:{step:number;setStep:(n:number)=>void}){
  return <div className="hostDesk">
    <div className="hostTabs">{["Listing wizard","Calendar & pricing","Bookings","Calendar sync","Host finance"].map((x,i)=><button className={step===i+1?"active":""} key={x} onClick={()=>setStep(i+1)}>{x}</button>)}</div>
    {step===1&&<Panel title="Listing wizard"><div className="wizardSteps"><span className="on">1 Basics</span><span>2 Photos</span><span>3 Amenities</span><span>4 Prices</span><span>5 Rules</span></div><div className="hostForm"><label>Property name<input placeholder="VIEWS apartment"/></label><label>Address<input value="Tashkent, NRG U-Tower" readOnly/></label><label>Type<select><option>Apartment</option></select></label><button className="primary">Next</button></div></Panel>}
    {step===2&&<Panel title="Calendar & pricing"><div className="calendarGrid">{Array.from({length:31},(_,i)=><span key={i} className={[5,6,12,13,14].includes(i)?"booked":[19,20].includes(i)?"blocked":""}>{i+1}</span>)}</div><div className="calendarLegend"><span className="available">Available</span><span className="booked">Booked</span><span className="blocked">Blocked</span></div></Panel>}
    {step===3&&<Panel title="Bookings"><div className="compactRows">{["Alex Johnson","Sarah Miller","David Kim"].map((n,i)=><div key={n}><span>{i===0?"12–15 Oct":"Upcoming"}</span><b>{n}</b><small>Live amount comes from booking source</small><i className={"status "+(i===2?"cancelled":"confirmed")}>{i===2?"cancelled":"confirmed"}</i></div>)}</div></Panel>}
    {step===4&&<Panel title="Calendar sync"><div className="syncCard"><RefreshCw/><div><b>iCal / OTA synchronization</b><p>Airbnb / Booking.com connectors appear here after partner authorization. No sync state is fabricated.</p></div><span className="status assigned">not connected</span></div></Panel>}
    {step===5&&<Panel title="Host finance"><section className="kpis"><article><span>Gross revenue</span><b>—</b></article><article><span>Paid out</span><b>—</b></article><article><span>Commission</span><b>—</b></article><article><span>Pending</span><b>—</b></article></section><div className="notice">Financial values remain unavailable until backed by live captured transactions.</div></Panel>}
  </div>;
}

function Finance(){
  return <div className="staffBoard"><Panel title="Finance & invoices"><div className="compactRows"><div><span>Payment</span><b>Booking invoice</b><small>Live data required</small><i className="status assigned">pending</i></div><div><span>Refund</span><b>Cancellation refund</b><small>Exact policy calculation required</small><i className="status assigned">review</i></div></div></Panel><Panel title="Financial controls"><div className="notice">No financial KPIs are invented. Revenue, ADR, RevPAR and balances are rendered only from persisted transactions.</div></Panel></div>;
}

function AdminPanel({orders,act}:{orders:ServiceOrder[];act:(id:string,a:"accept"|"start"|"complete")=>void|Promise<void>}){
  return <div className="adminGrid"><Panel title="Object moderation"><div className="compactRows">{["Sunrise Apartments","City Loft","Urban Garden"].map((n,i)=><div key={n}><span>{i===0?"Pending":"Published"}</span><b>{n}</b><small>Listing quality / content check</small><i className={"status "+(i===0?"assigned":"done")}>{i===0?"review":"active"}</i></div>)}</div></Panel><Panel title="Disputes & refunds"><div className="compactRows"><div><span>Case</span><b>Cancellation dispute</b><small>Awaiting evidence</small><i className="status assigned">open</i></div><div><span>Refund</span><b>Booking adjustment</b><small>Provider-backed calculation required</small><i className="status assigned">review</i></div></div></Panel><Panel title="All service orders"><Orders orders={orders} act={act}/></Panel></div>;
}

function IntegrationHub(){
  return <Panel title="Integration Hub"><div className="integrationGrid">{integrationCatalog.map(item=><article className="integrationCard" key={item.provider}><div><b>{item.label}</b><span>{item.capabilities.join(" · ")}</span></div><span className={"status "+(item.status==="configured"?"done":"assigned")}>{item.status.replaceAll("_"," ")}</span></article>)}</div><div className="notice">Credentials are never stored in this UI, browser storage or GitHub. Live secrets are added only to the deployment secret store.</div></Panel>;
}

function TeamPanel({orders}:{orders:ServiceOrder[]}){
  const staff=[["Nargiza","Housekeeping",3,5],["Rustam","Maintenance",2,3],["Malika","Concierge",4,7],["Bekzod","Front Desk",2,6]];
  return <div className="teamWorkload"><section className="kpis"><article><span>On shift</span><b>{staff.length}</b></article><article><span>Active tasks</span><b>{orders.filter(o=>o.status!=="done").length}</b></article><article><span>Unassigned</span><b>{orders.filter(o=>!o.assigneeUserId).length}</b></article><article><span>Overdue SLA</span><b>0</b></article></section><Panel title="Staff Workload"><div className="workloadGrid">{staff.map(([name,role,active,done])=><article key={String(name)}><div><b>{name}</b><small>{role}</small></div><span>Active <strong>{active}</strong></span><span>Done <strong>{done}</strong></span><i className={Number(active)>=4?"busy":"available"}>{Number(active)>=4?"busy":"available"}</i><button>Reassign</button></article>)}</div></Panel></div>;
}

function UnifiedInbox({orders,act,onOpen}:{orders:ServiceOrder[];act:(id:string,a:"accept"|"start"|"complete")=>void|Promise<void>;onOpen:(o:ServiceOrder)=>void}){
  const open=orders.filter(o=>!["done","closed","cancelled"].includes(o.status));
  const progress=open.filter(o=>["accepted","assigned","in_progress"].includes(o.status));
  const resolved=orders.filter(o=>["done","closed"].includes(o.status));
  return <div className="unifiedInbox"><div className="inboxTabs"><button className="active">Open Requests <b>{open.length}</b></button><button>In Progress <b>{progress.length}</b></button><button>Resolved Today <b>{resolved.length}</b></button></div><div className="inboxFilters"><button>Status</button><button>Category</button><button>SLA</button><button>Apartment</button><button>Guest</button><button>Assignee</button><span>Sort: Priority · Due Time</span></div><Orders orders={open} act={act} onOpen={onOpen}/></div>;
}

function Orders({orders,act,onOpen}:{orders:ServiceOrder[];act:(id:string,a:"accept"|"start"|"complete")=>void|Promise<void>;onOpen?:(o:ServiceOrder)=>void}){
  return <Panel title="Service Orders">{orders.length===0?<div className="emptyLine">No requests in this queue.</div>:<div className="orderList">{orders.map(o=><article className="order" key={o.id}><div onClick={()=>onOpen?.(o)}><b>{o.title}</b><span>Apt {o.unit??"—"} · {o.category.replaceAll("_"," ")} · {o.guestName??"No guest"}</span></div><span className={"status "+o.status}>{o.status.replaceAll("_"," ")}</span><div className="orderActions"><button onClick={()=>act(o.id,"accept")}>Accept</button><button className="primary" onClick={()=>act(o.id,"start")}>Start</button><button onClick={()=>act(o.id,"complete")}>Complete</button></div></article>)}</div>}</Panel>;
}


function creatableCategories(role:HospitalityRole){
  if(role==="front_desk")return ["reservation_front_desk","concierge"] as const;
  if(role==="housekeeping_supervisor")return ["cleaning"] as const;
  if(role==="maintenance_manager")return ["maintenance"] as const;
  if(role==="general_manager"||role==="super_admin")return ["concierge","cleaning","maintenance","reservation_front_desk"] as const;
  return [] as const;
}

function MobileCreateTask({live,role,onCreated}:{live:boolean;role:HospitalityRole;onCreated:()=>Promise<void>}){
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

  return <div><h3>Create task</h3>{categories.length===0?<div className="notice">This role cannot create operational tasks.</div>:<div className="mobileCreate">
    <label>Type<select value={category} onChange={e=>setCategory(e.target.value)}>{categories.map(x=><option key={x} value={x}>{x.replaceAll("_"," ")}</option>)}</select></label>
    <label>Description<textarea value={title} onChange={e=>setTitle(e.target.value)} placeholder="What needs to be done?"/></label>
    <label>Priority<select value={priority} onChange={e=>setPriority(e.target.value)}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select></label>
    <button className="primary" disabled={busy} onClick={submit}>{busy?"Creating…":"Create"}</button>
    {message&&<div className="notice">{message}</div>}
  </div>}</div>;
}

function Panel({title,children}:{title:string;children:React.ReactNode}){return <section className="panel"><header><small>VIEWS CRM</small><h2>{title}</h2></header>{children}</section>}

function StaffMobileDock({tab,setTab}:{tab:string;setTab:(t:any)=>void}){
  const items:[string,LucideIcon][]=[["tasks",ClipboardList],["detail",FileText],["proof",Camera],["create",Plus],["notifications",Bell]];
  return <nav className="staffMobileDock">{items.map(([id,Icon])=><button key={id} className={tab===id?"active":""} onClick={()=>setTab(id)}><Icon size={17}/><span>{id}</span></button>)}</nav>;
}

function StaffMobileSheet({tab,setTab,orders,selected,setSelected,act,proofBefore,proofAfter,setProofBefore,setProofAfter,live,role,onLiveCreated}:{tab:string;setTab:(t:any)=>void;orders:ServiceOrder[];selected:ServiceOrder|null;setSelected:(o:ServiceOrder|null)=>void;act:(id:string,a:"accept"|"start"|"complete")=>void|Promise<void>;proofBefore:boolean;proofAfter:boolean;setProofBefore:(v:boolean)=>void;setProofAfter:(v:boolean)=>void;live:boolean;role:HospitalityRole;onLiveCreated:()=>Promise<void>}){
  return <div className="staffMobileSheet">
    {tab==="tasks"&&<div><h3>My Tasks</h3>{orders.slice(0,4).map(o=><button className="mobileTask" key={o.id} onClick={()=>{setSelected(o);setTab("detail")}}><span>{o.title}</span><i className={"status "+o.status}>{o.status}</i></button>)}</div>}
    {tab==="detail"&&<div><h3>Task detail</h3>{selected?<><div className="mobileDetail"><b>{selected.title}</b><span>Apt {selected.unit??"—"}</span><span>{selected.category}</span><span>SLA {selected.slaMinutes||"—"} min</span></div><div className="orderActions"><button onClick={()=>act(selected.id,"accept")}>Accept</button><button className="primary" onClick={()=>act(selected.id,"start")}>Start</button><button onClick={()=>act(selected.id,"complete")}>Complete</button></div></>:<p>Select a task.</p>}</div>}
    {tab==="proof"&&<div><h3>Before / after proof</h3><div className="mobileProof"><button className={proofBefore?"done":""} onClick={()=>setProofBefore(true)}><Camera/><b>Before</b><small>{proofBefore?"Captured":"Capture photo"}</small></button><button className={proofAfter?"done":""} onClick={()=>setProofAfter(true)}><ImageIcon/><b>After</b><small>{proofAfter?"Captured":"Capture photo"}</small></button></div></div>}
    {tab==="create"&&<MobileCreateTask live={live} role={role} onCreated={onLiveCreated}/>}
    {tab==="notifications"&&<div><h3>Notifications</h3><div className="compactRows"><div><span>Now</span><b>New task assigned</b><small>Apartment #235</small></div><div><span>5 min</span><b>Booking confirmed</b><small>Guest arrival updated</small></div><div><span>10 min</span><b>Message</b><small>Concierge request waiting</small></div></div></div>}
  </div>;
}
