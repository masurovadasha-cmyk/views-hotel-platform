import {GuestLocaleProvider,GuestLanguageSelector,useGuestLocale} from './features/guest/GuestLocale';
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
  return <StaffLocaleProvider manageDocument={false} persist={false}><GuestLocaleProvider manageDocument={false} persist={false}><Application/></GuestLocaleProvider></StaffLocaleProvider>;
}
function Application(){
  const {t,locale:staffLocale}=useStaffLocale();
  const {t:guestT,locale:guestLocale}=useGuestLocale();
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
  const staffMode=runtime==='local-core'||(live?session?.mode==='staff':demoMode==='staff');
  useEffect(()=>{const locale=staffMode?staffLocale:guestLocale;document.documentElement.lang=locale;try{localStorage.setItem(staffMode?"views.staff.locale":"views.guest.locale",locale);}catch{/* Language selection still works without storage. */}},[staffMode,staffLocale,guestLocale]);
  const content=()=>{
    if(runtime==="local-core")return <StaffMailEntry/>;
    if(live&&loading)return <main className="authShell"><div className="notice">{guestT('Checking secure session…')}</div></main>;
    if(live&&!session)return <main className="authShell"><AuthPanel onDone={refreshSession}/></main>;
    if(live&&session?.mode==="guest")return <GuestApp live/>;
    if(live&&session?.mode==="staff")return <div lang={staffLocale}><StaffApp role={session.role} onRoleChange={()=>{}} allowRoleSwitch={false} live/></div>;
    return demoMode==="guest"?<GuestApp/>:<div lang={staffLocale}><StaffApp role={demoRole} onRoleChange={setDemoRole} allowRoleSwitch/></div>;
  };

  return <div className={(dark?"app dark":"app")+(runtime!=="local-core"?" guestLocaleApp":"")}>
    <header className="brandbar">
      <div className="brand" lang="en"><span className="vmark">V</span><div><strong>VIEWS</strong><small>HOTEL & APARTMENTS</small></div><i/><p>One Ecosystem<br/>A Better Experience</p></div>
      <div className="cities" lang="en">TASHKENT · SAMARKAND · BUKHARA · KHIVA · AND BEYOND</div>
      <div className="topActions">
        <span className="runtimeBadge">{staffMode?t(runtimeLabel(runtime)):guestT(runtimeLabel(runtime))}</span>
        {staffMode?<StaffLanguageSelector/>:<GuestLanguageSelector/>}
        <button onClick={()=>setDark(v=>!v)}>{staffMode?t(dark?'Светлая тема':'Тёмная тема'):guestT(dark?'Light':'Dark')}</button>
        {!live&&runtime!=="local-core"&&<button onClick={()=>setDemoMode(demoMode==="guest"?"staff":"guest")}>{demoMode==='guest'?guestT('Staff CRM'):t('Гостевое приложение')}</button>}
        {live&&session&&<button onClick={async()=>{await api.logout();setSession(null)}}>{staffMode?t('Выйти'):guestT('Sign out')}</button>}
      </div>
    </header>
    {content()}
  </div>;
}
