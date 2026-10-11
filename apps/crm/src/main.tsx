import React,{useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {StaffRoleHeading,StaffRoleUnavailable,roleText} from '../../../src/features/staff-entry/StaffRoleEntry';
import {staffRoles,roleInfo,type StaffRole} from '../../../src/features/staff-entry/staff-roles';
import {translate,type Locale} from '../../../src/i18n/messages';
import '../../../src/design-system/foundation.css';
import './shell.css';
const messages={
 'CRM preview — sign-in and operational data are not connected.':{ru:'Каркас CRM — вход и рабочие данные не подключены.',uz:'CRM namoyishi — kirish va ish maʼlumotlari ulanmagan.'},
 'Language':{ru:'Язык',uz:'Til'},'Dark theme':{ru:'Тёмная тема',uz:'Qorongʻi mavzu'},
 'Work area':{ru:'Направление работы',uz:'Ish yoʻnalishi'},
};
function App(){
 const [locale,setLocale]=useState<Locale>('ru'),[dark,setDark]=useState(false),[role,setRole]=useState<StaffRole>('front_desk');
 const t=(s:string)=>translate(messages,locale,s);
 useEffect(()=>{document.documentElement.lang=locale;},[locale]);
 return <div className={'app crmShell'+(dark?' dark':'')}><header className="shellToolbar"><strong>VIEWS CRM</strong>
  <label>{t('Language')} <select aria-label={t('Language')} value={locale} onChange={e=>setLocale(e.target.value as Locale)}><option value="ru">Русский</option><option value="uz">Oʻzbekcha</option><option value="en">English</option></select></label>
  <label><input type="checkbox" checked={dark} onChange={e=>setDark(e.target.checked)}/>{t('Dark theme')}</label></header>
  <main><p role="status">{t('CRM preview — sign-in and operational data are not connected.')}</p>
   <label>{t('Work area')} <select aria-label={t('Work area')} value={role} onChange={e=>setRole(e.target.value as StaffRole)}>{staffRoles.map(r=><option key={r} value={r}>{roleText(locale,roleInfo[r].title)}</option>)}</select></label>
   <StaffRoleHeading role={role} locale={locale}/><StaffRoleUnavailable locale={locale}/>
  </main></div>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
