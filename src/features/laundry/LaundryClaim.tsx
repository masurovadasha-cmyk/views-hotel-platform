import {useState} from 'react';
import type {Locale} from '../../i18n/messages';
import {localeTags} from '../local-core/staff-locale';
import type {LaundryIntake} from './model';
import {claimText} from './claim-locale';
import './claims.css';
export function LaundryClaim({intake:o,locale,staff=false,disabled,onAction}:{intake:LaundryIntake;locale:Locale;staff?:boolean;disabled:boolean;onAction:(action:string,fields?:Record<string,unknown>)=>void}){
 const t=(k:string)=>claimText(locale,k),[tag,setTag]=useState(o.claim?.tag??o.items?.[0]?.tag??''),[kind,setKind]=useState(o.claim?.kind??'quality'),[note,setNote]=useState(''),[checked,setChecked]=useState(false);
 const claim=o.claim,limited=(claim?.history.length??0)>=8,canReport=!staff&&['accepted','washing','ready','delivered','closed'].includes(o.stage)&&claim?.status!=='open'&&!limited,canAnswer=staff&&claim?.status==='open'&&!limited;
 if(!claim&&!canReport)return null;
 return <section className="laundryClaim" data-testid="laundry-claim"><h4>{t('title')}</h4><p>{t('hint')}</p>
 {claim&&<><strong role="status">{t(claim.status)}</strong><p>{t('tag')}: {claim.tag} · {t(claim.kind)}</p><ol>{claim.history.map((e,index)=><li key={index}><small>{t(e.action)} · {new Intl.DateTimeFormat(localeTags[locale],{dateStyle:'short',timeStyle:'short'}).format(new Date(e.at))}{e.tag&&' · '+e.tag}</small><p>{e.note}</p></li>)}</ol></>}
 {claim&&claim.status!=='resolved'&&<p>{t(o.stage==='closed'?'alreadyCharged':'blocked')}</p>}{limited&&<p>{t('limit')}</p>}
 {(canReport||canAnswer)&&<form onSubmit={e=>{e.preventDefault();if(note.trim().length<3||canAnswer&&!checked)return;onAction(canAnswer?'answer_claim':'report_claim',{note:note.trim(),...(canReport?{tag,kind}:{})});}}><fieldset disabled={disabled}>
 {canReport&&<><label>{t('tag')}<select aria-label={t('tag')} value={tag} onChange={e=>setTag(e.target.value)}>{o.items?.map(item=><option key={item.tag} value={item.tag}>{item.tag} · {item.description}</option>)}</select></label><label>{t('kind')}<select aria-label={t('kind')} value={kind} onChange={e=>setKind(e.target.value as typeof kind)}>{['quality','missing','damaged'].map(k=><option key={k} value={k}>{t(k)}</option>)}</select></label></>}
 <label>{t(canAnswer?'answer':'note')}<input required minLength={3} maxLength={500} value={note} onChange={e=>{setNote(e.target.value);setChecked(false);}}/></label>
 {canAnswer&&<label><input type="checkbox" checked={checked} onChange={e=>setChecked(e.target.checked)}/>{t('checked')}</label>}<button disabled={note.trim().length<3||canAnswer&&!checked}>{t(canAnswer?'reply':'report')}</button></fieldset></form>}
 {!staff&&claim&&claim.status!=='resolved'&&<fieldset disabled={disabled}><label><input type="checkbox" checked={checked} onChange={e=>setChecked(e.target.checked)}/>{t('consent')}</label><button disabled={!checked} onClick={()=>onAction('resolve_claim')}>{t('resolve')}</button></fieldset>}</section>;
}
