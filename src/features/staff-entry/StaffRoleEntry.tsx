import type {Locale} from '../../i18n/messages';
import {translate} from '../../i18n/messages';
import {roleInfo,staffRoles,staffEntryUrl,type StaffRole} from './staff-roles';
import catalog from './staff-role-translations.json';
import './staff-role-entry.css';
export const roleText=(locale:Locale,source:string,values:Record<string,string>={})=>translate(catalog,locale,source,values);
export function StaffRoleLinks({locale,local=false,roles=staffRoles}:{locale:Locale;local?:boolean;roles?:readonly StaffRole[]}){
 const t=(s:string)=>roleText(locale,s);
 return <section className="staffRoleDirectory" aria-label={t('Separate employee sign-ins')}><h2>{t('Separate employee sign-ins')}</h2><p>{t('Choose your work area. This choice does not assign a role or change account permissions.')}</p><div className="staffRoleGrid">{roles.map(role=><a key={role} href={staffEntryUrl(role,local)} data-staff-entry={role}><strong>{t(roleInfo[role].title)}</strong><span>{t(roleInfo[role].description)}</span></a>)}</div></section>;
}
export function StaffRoleHeading({role,locale,entry=false}:{role:StaffRole;locale:Locale;entry?:boolean}){
 const info=roleInfo[role],t=(s:string)=>roleText(locale,s);
 return <header className={'staffRoleHeading role-'+role} data-staff-role={role}><span className="staffRoleEyebrow">VIEWS · {t(info.title)}</span><h1>{roleText(locale,entry?'Sign in: {role}':'Workspace: {role}',{role:t(info.title)})}</h1><p>{t(info.description)}</p><ul aria-label={t('My work areas')}>{info.tasks.map(task=><li key={task}>{t(task)}</li>)}</ul></header>;
}
export function StaffRoleUnavailable({locale,noPermission=false}:{locale:Locale;noPermission?:boolean}){
 return <section className="localWorkspace staffRoleUnavailable" role="status"><h2>{roleText(locale,noPermission?'No operational sections are available with your current permissions.':'Work tools are not connected for this role yet.')}</h2>{!noPermission&&<p>{roleText(locale,'Requests, assignments and completion records will appear after the operational module is connected. No live tasks are shown here.')}</p>}</section>;
}
export function StaffRolePreviewEntry({role,locale,onPreview}:{role:StaffRole;locale:Locale;onPreview:()=>void}){
 const t=(s:string)=>roleText(locale,s);
 return <main className="staffRoleEntry"><StaffRoleHeading role={role} locale={locale} entry/><p className="staffRoleNotice">{t('This is a role interface preview with sample data, not an authenticated employee session.')}</p><section className="staffRoleSignIn"><p role="status">{t('Email sign-in is not connected in this preview. No email is sent and no account is created.')}</p><fieldset disabled><label>{t('Employee email')}<input type="email" autoComplete="off" placeholder="name@example.com"/></label><button>{t('Continue with email')}</button></fieldset><button className="primary" onClick={onPreview}>{t('Explore this role’s demo')}</button></section><StaffRoleLinks locale={locale}/><a href={location.pathname+'?api=demo&entry=access'}>{t('All sign-in directions')}</a></main>;
}
