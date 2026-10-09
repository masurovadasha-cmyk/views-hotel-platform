import {GuestEmailEntry} from './features/guest-auth/GuestEmailEntry';
import type {GuestEmailLinkState} from './features/guest-auth/guest-email-link';
import {GuestLocaleProvider,GuestLanguageSelector,useGuestLocale} from './features/guest/GuestLocale';
import {StaffLocaleProvider,StaffLanguageSelector,useStaffLocale} from './features/local-core/StaffLocale';
import {StaffMailEntry} from "./features/local-core/StaffMailEntry";
import {useEffect,useState} from "react";
import type {HospitalityRole} from "./domain/types";
import {GuestApp} from "./features/guest/GuestApp";
import {StaffApp} from "./features/staff/StaffApp";
import {api} from "./api/client";
import {detectRuntimeMode,runtimeLabel} from "./api/runtime";
import {AccessPortal,type AccessAudience} from './features/auth/AccessPortal';
import {StaffRolePreviewEntry,StaffRoleHeading,StaffRoleUnavailable} from './features/staff-entry/StaffRoleEntry';
import {requestedStaffRole,roleInfo,staffEntryUrl} from './features/staff-entry/staff-roles';
import {readTheme,saveTheme} from './design-system/theme';
import {ConnectionNotice} from './design-system/ConnectionNotice';

type Session =
 | {mode:"guest";userId:string;guestId:string;organizationId:string}
 | {mode:"staff";userId:string;role:HospitalityRole;organizationId:string;propertyIds:string[]};

export function App({guestLink}:{guestLink:GuestEmailLinkState}){
  return <StaffLocaleProvider manageDocument={false} persist={false}><GuestLocaleProvider manageDocument={false} persist={false}><Application guestLink={guestLink}/></GuestLocaleProvider></StaffLocaleProvider>;
}
function Application({guestLink}:{guestLink:GuestEmailLinkState}){
  const {t,locale:staffLocale}=useStaffLocale();
  const {t:guestT,locale:guestLocale}=useGuestLocale();
  const runtime=detectRuntimeMode();
  const selectedStaffRole=requestedStaffRole();
  const [demoMode,setDemoMode]=useState<"guest"|"staff">("guest");
  const [demoRole,setDemoRole]=useState<HospitalityRole>("general_manager");
  const [dark,setDark]=useState(()=>readTheme()==='dark');
  const [accessOpen,setAccessOpen]=useState(()=>{const q=new URLSearchParams(location.search);return q.get('entry')==='access'||!q.has('api');});
  const [rolePreviewOpen,setRolePreviewOpen]=useState(!!selectedStaffRole);
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
  useEffect(()=>{saveTheme(dark?'dark':'light');},[dark]);

  const live=runtime==="live-api";
  const staffMode=runtime==='local-core'||(live?session?.mode==='staff':!accessOpen&&demoMode==='staff');
  function preview(audience:AccessAudience){if(audience==='supplies'){location.assign(staffEntryUrl('procurement',false));return;}setDemoMode(audience==='guest'?'guest':'staff');setDemoRole(audience==='host'?'owner_readonly':audience==='admin'?'super_admin':'general_manager');setAccessOpen(false);}
  useEffect(()=>{const locale=staffMode?staffLocale:guestLocale;document.documentElement.lang=locale;try{localStorage.setItem(staffMode?"views.staff.locale":"views.guest.locale",locale);}catch{/* Language selection still works without storage. */}},[staffMode,staffLocale,guestLocale]);
  const content=()=>{
    if(runtime==="guest-core")return <GuestEmailEntry initialLink={guestLink}/>;
    if(runtime==="local-core")return <StaffMailEntry/>;
    if(runtime==='static-demo'&&selectedStaffRole&&rolePreviewOpen)return <StaffRolePreviewEntry role={selectedStaffRole} locale={guestLocale} onPreview={()=>{setDemoMode('staff');const demo=roleInfo[selectedStaffRole].demoRole;if(demo)setDemoRole(demo);setAccessOpen(false);setRolePreviewOpen(false);}}/>;
    if(live&&loading)return <main className="authShell"><div className="notice">{guestT('Checking secure session…')}</div></main>;
    if(live&&!session)return <AccessPortal demo={false} onPreview={preview} onDone={refreshSession}/>;
    if(live&&session?.mode==="guest")return <GuestApp live/>;
    if(live&&session?.mode==="staff")return <div lang={staffLocale}><StaffApp role={session.role} onRoleChange={()=>{}} allowRoleSwitch={false} live/></div>;
    if(accessOpen)return <AccessPortal demo onPreview={preview} onDone={refreshSession}/>;
    if(runtime==='static-demo'&&selectedStaffRole&&!roleInfo[selectedStaffRole].demoRole)return <main className="staffRoleEntry"><StaffRoleHeading role={selectedStaffRole} locale={staffLocale}/><StaffRoleUnavailable locale={staffLocale}/></main>;
    return demoMode==="guest"?<GuestApp/>:<div lang={staffLocale}><StaffApp role={demoRole} onRoleChange={setDemoRole} allowRoleSwitch={!selectedStaffRole}/></div>;
  };

  return <div data-workspace={staffMode||selectedStaffRole&&rolePreviewOpen?'staff':'guest'} className={(dark?"app dark":"app")+(runtime!=="local-core"?" guestLocaleApp":"")}>
    <header className="brandbar">
      <div className="brand" lang="en"><span className="vmark">V</span><div><strong>VIEWS</strong><small>HOTEL & APARTMENTS</small></div><i/><p>One Ecosystem<br/>A Better Experience</p></div>
      <div className="cities" lang="en">TASHKENT · SAMARKAND · BUKHARA · KHIVA · AND BEYOND</div>
      <div className="topActions">
        <span className="runtimeBadge">{staffMode?t(runtimeLabel(runtime)):guestT(runtimeLabel(runtime))}</span>
        {staffMode?<StaffLanguageSelector/>:<GuestLanguageSelector/>}
        {!live&&runtime!=="local-core"&&runtime!=="guest-core"&&!accessOpen&&<button onClick={()=>{setRolePreviewOpen(false);setAccessOpen(true);}}>VIEWS · {guestT('Sign in')}</button>}
        <button data-theme-toggle aria-pressed={dark} onClick={()=>setDark(v=>!v)}>{staffMode?t(dark?'Светлая тема':'Тёмная тема'):guestT(dark?'Light':'Dark')}</button>
        {!live&&runtime!=="local-core"&&runtime!=="guest-core"&&!accessOpen&&!selectedStaffRole&&<button onClick={()=>setDemoMode(demoMode==="guest"?"staff":"guest")}>{demoMode==='guest'?guestT('Staff CRM'):t('Гостевое приложение')}</button>}
        {live&&session&&<button onClick={async()=>{await api.logout();setSession(null)}}>{staffMode?t('Выйти'):guestT('Sign out')}</button>}
      </div>
    </header>
    {(runtime==='static-demo'||runtime==='live-api')&&<ConnectionNotice locale={staffMode?staffLocale:guestLocale}/>}
    {content()}
  </div>;
}
