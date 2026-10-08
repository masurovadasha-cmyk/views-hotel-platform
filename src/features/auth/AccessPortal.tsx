import {useState} from 'react';
import {ArrowRight,Building2,Mail,ShieldCheck,UserRound,Users} from 'lucide-react';
import {useGuestLocale} from '../guest/GuestLocale';
import {translate} from '../../i18n/messages';
import {AuthPanel} from './AuthPanel';
import messages from './access-translations.json';
import release from '../../../release.config.json';
import './access-portal.css';

export type AccessAudience='guest'|'host'|'staff'|'admin';
const directions=[
 {id:'guest',title:'Guests',description:'Find an apartment, manage your trip and order services.',icon:UserRound},
 {id:'host',title:'Hosts & owners',description:'Manage properties, availability, rates and statements.',icon:Building2},
 {id:'staff',title:'Employees',description:'Reception, housekeeping, maintenance and guest care.',icon:Users},
 {id:'admin',title:'Platform administration',description:'Moderation, disputes, commissions and access control.',icon:ShieldCheck}
] as const;
export function AccessPortal({demo,onPreview,onDone}:{demo:boolean;onPreview:(audience:AccessAudience)=>void;onDone:()=>void}){
 const {locale}=useGuestLocale(),t=(s:string)=>translate(messages,locale,s);
 const [audience,setAudience]=useState<AccessAudience>('guest'),[showEmail,setShowEmail]=useState(false);
 const selected=directions.find(d=>d.id===audience)!;
 return <main className="accessPortal">
  <section className="accessHero">
   <div><span className="accessEyebrow">VIEWS · HOTEL & APARTMENTS</span><h1>{t('Your stay. Your space. Your VIEWS.')}</h1>
    <p>{t('More than accommodation. A better experience in Uzbekistan.')}</p>
    <span className="accessCities">TASHKENT · SAMARKAND · BUKHARA · KHIVA</span>
   </div><img src={new URL('../../assets/demo/panoramic.jpg',import.meta.url).href} alt={t('VIEWS apartment interior')}/>
  </section>
  <section className="accessWorkspaces" aria-labelledby="access-heading">
   <div className="accessSectionHeading"><div><span className="accessEyebrow">{t('ONE PLATFORM')}</span><h2 id="access-heading">{t('Choose your workspace')}</h2></div><span className="accessVersion">{release.version}</span></div>
   <div className="accessCards">{directions.map(d=><button key={d.id} className={audience===d.id?'accessCard selected':'accessCard'} aria-pressed={audience===d.id} onClick={()=>{setAudience(d.id);setShowEmail(false);}}>
    <d.icon size={25} aria-hidden="true"/><strong>{t(d.title)}</strong><span>{t(d.description)}</span><ArrowRight size={18} aria-hidden="true"/>
   </button>)}</div>
   <div className="accessActions"><div><strong>{t(selected.title)}</strong><p>{t('Email identifies your account. Permissions are assigned by the platform, never by this selection.')}</p></div>
    <button className="primary" onClick={()=>setShowEmail(true)}><Mail size={17} aria-hidden="true"/>{t('Sign in with email')}</button>
    {demo&&<button className="accessPreview" onClick={()=>onPreview(audience)}>{t('Explore demo screens')}<ArrowRight size={17} aria-hidden="true"/></button>}
   </div>
   {showEmail&&(demo?<section className="accessEmail" aria-label={t('Email sign-in')}>
    <h3>{t('Email sign-in')}</h3><p role="status">{t('Email sign-in is not connected in this preview. No email is sent and no account is created.')}</p>
    <fieldset disabled><label>{t('Email')}<input type="email" autoComplete="off" placeholder="name@example.com"/></label><button className="primary">{t('Continue with email')}</button></fieldset>
   </section>:<AuthPanel onDone={onDone}/>)}
  </section>
  {demo&&<aside className="accessDisclosure"><ShieldCheck aria-hidden="true" size={20}/><p>{t('Interface preview with sample data. Real bookings, payments and staff access require a connected server.')}</p></aside>}
  <footer className="accessFooter"><span>VIEWS · {t('People. Places. Possibilities.')}</span><a href="https://github.com/masurovadasha-cmyk/views-hotel-platform/releases/tag/v0.8.0-preview" target="_blank" rel="noreferrer">{t('Android build & release notes')}</a></footer>
 </main>;
}
