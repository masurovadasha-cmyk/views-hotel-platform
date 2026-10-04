import { useMemo, useState } from "react";
import { Bell, Building2, CalendarDays, ClipboardList, Gauge, ShieldCheck, Sparkles, Users, WalletCards, Wrench } from "lucide-react";
import type { HospitalityRole, ServiceOrder } from "../../domain/types";
import { initialOrders } from "../../data/demo";
import { canSeeServiceOrder, roleNavigation } from "../../domain/rbac";
import { transitionServiceOrder } from "../../domain/workflows";
import { integrationCatalog } from "../../domain/integrations";

const roles:HospitalityRole[]=["cleaner","concierge","technician","front_desk","general_manager","super_admin"];
const labels:Record<string,string>={overview:"Overview","my-tasks":"My Tasks",inbox:"Inbox",operations:"Operations","front-desk":"Front Desk",guests:"Guests CRM",housekeeping:"Housekeeping",maintenance:"Maintenance",host:"Host Desk",finance:"Finance",admin:"Admin",integrations:"Integrations",team:"Team",messages:"Messages"};
const iconFor=(id:string)=>id.includes("maintenance")?Wrench:id.includes("housekeeping")?Sparkles:id.includes("front")?CalendarDays:id==="guests"?Users:id==="finance"?WalletCards:id==="host"?Building2:id==="admin"||id==="integrations"?ShieldCheck:id==="inbox"?Bell:id==="overview"?Gauge:ClipboardList;

export function StaffApp({role,onRoleChange,allowRoleSwitch=true}:{role:HospitalityRole;onRoleChange:(r:HospitalityRole)=>void;allowRoleSwitch?:boolean}){
  const [active,setActive]=useState(roleNavigation[role][0]);
  const [orders,setOrders]=useState<ServiceOrder[]>(initialOrders);
  const userId=role==="cleaner"?"u-cleaner":role==="technician"?"u-tech":"u-manager";
  const visible=useMemo(()=>orders.filter(o=>canSeeServiceOrder(role,userId,o)),[orders,role,userId]);
  const nav=roleNavigation[role];
  const current=nav.includes(active)?active:nav[0];

  const act=(id:string,action:"accept"|"start"|"complete")=>setOrders(currentOrders=>currentOrders.map(o=>{
    if(o.id!==id)return o;
    try{
      const status=transitionServiceOrder(o.status,action);
      return {...o,status,assigneeUserId:o.assigneeUserId??userId,history:[...o.history,action]};
    }catch{return o}
  }));

  const content=()=>{
    if(current==="overview"||current==="my-tasks"||current==="inbox")return <><section className="kpis"><article><span>Visible tasks</span><b>{visible.length}</b></article><article><span>Overdue SLA</span><b>0</b></article><article><span>Property</span><b>NRG</b></article><article><span>Role</span><b>{role.replaceAll("_"," ")}</b></article></section><Orders orders={visible} act={act}/></>;
    if(current==="front-desk")return <Panel title="Reservations"><div className="notice">Front Desk workflow shell is isolated to front-office roles. Live reservation data will come from the transactional store.</div></Panel>;
    if(current==="guests")return <Panel title="Guest 360"><div className="notice">Guest profile, stay history and service interactions share one hospitality identity. No real personal data is seeded.</div></Panel>;
    if(current==="housekeeping")return <Panel title="Housekeeping"><Workflow text="occupied → checkout_due → dirty → cleaning → inspection → ready"/><div className="notice">DND and service-declined remain explicit branches.</div></Panel>;
    if(current==="maintenance")return <Panel title="Maintenance"><Workflow text="open → assigned/in_progress → waiting/blocked → resolved → inspection/verified → closed"/></Panel>;
    if(current==="host")return <Panel title="Host Desk"><div className="notice">Listings, booking readiness and integrations are shown truthfully. No OTA/iCal connector is marked active until connected.</div></Panel>;
    if(current==="finance")return <Panel title="Finance"><div className="notice">No financial KPIs are invented. Revenue, ADR and RevPAR stay unavailable until backed by captured transactional data.</div></Panel>;
    if(current==="admin")return <><section className="kpis"><article><span>Listings</span><b>4</b></article><article><span>Roles</span><b>13</b></article><article><span>Service orders</span><b>{orders.length}</b></article><article><span>Integrations</span><b>{integrationCatalog.length}</b></article></section><Orders orders={orders} act={act}/></>;
    if(current==="integrations")return <Panel title="Integration Hub"><div className="integrationGrid">{integrationCatalog.map(item=><article className="integrationCard" key={item.provider}><div><b>{item.label}</b><span>{item.capabilities.join(" · ")}</span></div><span className={"status "+(item.status==="configured"?"done":"assigned")}>{item.status.replaceAll("_"," ")}</span></article>)}</div><div className="notice">Credentials are never stored in this UI, browser storage or GitHub. Live secrets are added only to the deployment secret store.</div></Panel>;
    return <Panel title={labels[current]??current}><div className="notice">Module foundation ready for the next backend slice.</div></Panel>;
  };

  return <div className="staffLayout"><aside className="sidebar"><div className="sideBrand">VIEWS <small>OPERATIONS</small></div><nav>{nav.map(id=>{const Icon=iconFor(id);return <button className={current===id?"active":""} key={id} onClick={()=>setActive(id)}><Icon size={17}/><span>{labels[id]??id}</span></button>})}</nav></aside>
    <main className="staffMain"><header className="staffHead"><div><small>VIEWS OPERATIONS</small><h1>{labels[current]??current}</h1></div>{allowRoleSwitch?<select value={role} onChange={e=>{const next=e.target.value as HospitalityRole;onRoleChange(next);setActive(roleNavigation[next][0])}}>{roles.map(r=><option key={r} value={r}>{r.replaceAll("_"," ")}</option>)}</select>:<span className="roleLock">{role.replaceAll("_"," ")}</span>}</header>{content()}</main></div>
}

function Orders({orders,act}:{orders:ServiceOrder[];act:(id:string,a:"accept"|"start"|"complete")=>void}){
  return <Panel title="Service Orders">{orders.length===0?<div className="emptyLine">No requests in this queue.</div>:<div className="orderList">{orders.map(o=><article className="order" key={o.id}><div><b>{o.title}</b><span>Apt {o.unit??"—"} · {o.category.replaceAll("_"," ")} · {o.guestName??"No guest"}</span></div><span className={"status "+o.status}>{o.status.replaceAll("_"," ")}</span><div className="orderActions"><button onClick={()=>act(o.id,"accept")}>Accept</button><button className="primary" onClick={()=>act(o.id,"start")}>Start</button><button onClick={()=>act(o.id,"complete")}>Complete</button></div></article>)}</div>}</Panel>
}
function Panel({title,children}:{title:string;children:React.ReactNode}){return <section className="panel"><header><small>VIEWS CRM</small><h2>{title}</h2></header>{children}</section>}
function Workflow({text}:{text:string}){return <div className="workflow">{text.split(" → ").map((x,i)=><span key={x}>{i>0&&<i>→</i>}<b>{x}</b></span>)}</div>}
