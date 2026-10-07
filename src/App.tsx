import {StaffLocaleProvider,StaffLanguageSelector,useStaffLocale} from './features/local-core/StaffLocale';
import {StaffMailEntry} from "./features/local-core/StaffMailEntry";
import {useEffect,useState} from "react";
import type {HospitalityRole} from "./domain/types";
import {GuestApp} from "./features/guest/GuestApp";
import {StaffApp} from "./features/staff/StaffApp";
import {AuthPanel} from "./features/auth/AuthPanel";
import {api} from "./api/client";
import {detectRuntimeMode,runtimeLabel} from "./api/runtime";

type Session =
 | {mode:"guest";userId:string;guestId:string;organizationId:string}
 | {mode:"staff";userId:string;role:HospitalityRole;organizationId:string;propertyIds:string[]};

export function App(){
  return detectRuntimeMode()==='local-core'?<StaffLocaleProvider><Application/></StaffLocaleProvider>:<Application/>;
}
function Application(){
  const {t}=useStaffLocale();
  const runtime=detectRuntimeMode();
  const [demoMode,setDemoMode]=useState<"guest"|"staff">("guest");
  const [demoRole,setDemoRole]=useState<HospitalityRole>("general_manager");
  const [dark,setDark]=useState(false);
  const [session,setSession]=useState<Session|null>(null);
  const [loading,setLoading]=useState(runtime==="live-api");

  async function refreshSession(){
    if(runtime!=="live-api")return;
    setLoading(true);
    try{
      const result=await api.session();
      setSession(result.authenticated?(result.session as Session):null);
    }catch{setSession(null)}
    finally{setLoading(false)}
  }

  useEffect(()=>{void refreshSession()},[]);

  const live=runtime==="live-api";
  const content=()=>{
    if(runtime==="local-core")return <StaffMailEntry/>;
    if(live&&loading)return <main className="authShell"><div className="notice">Checking secure session…</div></main>;
    if(live&&!session)return <main className="authShell"><AuthPanel onDone={refreshSession}/></main>;
    if(live&&session?.mode==="guest")return <GuestApp live/>;
    if(live&&session?.mode==="staff")return <StaffApp role={session.role} onRoleChange={()=>{}} allowRoleSwitch={false} live/>;
    return demoMode==="guest"?<GuestApp/>:<StaffApp role={demoRole} onRoleChange={setDemoRole} allowRoleSwitch/>;
  };

  return <div className={dark?"app dark":"app"}>
    <header className="brandbar">
      <div className="brand" lang="en"><span className="vmark">V</span><div><strong>VIEWS</strong><small>HOTEL & APARTMENTS</small></div><i/><p>One Ecosystem<br/>A Better Experience</p></div>
      <div className="cities" lang="en">TASHKENT · SAMARKAND · BUKHARA · KHIVA · AND BEYOND</div>
      <div className="topActions">
        <span className="runtimeBadge">{t(runtimeLabel(runtime))}</span>
        {runtime==="local-core"&&<StaffLanguageSelector/>}
        <button onClick={()=>setDark(v=>!v)}>{runtime==='local-core'?t(dark?'Светлая тема':'Тёмная тема'):dark?'Light':'Dark'}</button>
        {!live&&runtime!=="local-core"&&<button onClick={()=>setDemoMode(demoMode==="guest"?"staff":"guest")}>{demoMode==="guest"?"Staff CRM":"Guest App"}</button>}
        {live&&session&&<button onClick={async()=>{await api.logout();setSession(null)}}>Sign out</button>}
      </div>
    </header>
    {content()}
  </div>;
}
