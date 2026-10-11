import {useState} from 'react';
import type {Locale} from '../../i18n/messages';
import type {KnowledgeArticle} from './support-model';
import {supportText} from './support-locale';
export function KnowledgeEditor({article,locale,disabled,onSave,onCancel}:{article:KnowledgeArticle;locale:Locale;disabled:boolean;onSave:(body:Record<string,unknown>)=>void;onCancel:()=>void}){
 const t=(k:string)=>supportText(locale,k),[title,setTitle]=useState(article.title),[text,setText]=useState(article.content),[language,setLanguage]=useState(article.language),[active,setActive]=useState(article.active),[checked,setChecked]=useState(false);
 return <form data-testid="knowledge-editor" onSubmit={e=>{e.preventDefault();if(title.trim()&&text.trim()&&(!active||checked))onSave({id:article.id,expectedRevision:article.revision,title:title.trim(),text:text.trim(),language,active});}}><fieldset disabled={disabled} onChange={()=>setChecked(false)}>
 <label>{t('language')}<select aria-label={t('language')} value={language} onChange={e=>setLanguage(e.target.value as KnowledgeArticle['language'])}>{['ru','uz','en'].map(k=><option key={k} value={k}>{k.toUpperCase()}</option>)}</select></label>
 <label>{t('title')}<input required maxLength={80} value={title} onChange={e=>setTitle(e.target.value)}/></label><label>{t('text')}<input required maxLength={500} value={text} onChange={e=>setText(e.target.value)}/></label>
 <label><input type="checkbox" checked={active} onChange={e=>setActive(e.target.checked)}/>{t('active')}</label></fieldset>
 <fieldset disabled={disabled}>{active&&<label><input type="checkbox" checked={checked} onChange={e=>setChecked(e.target.checked)}/>{t('verified')}</label>}<button disabled={!title.trim()||!text.trim()||active&&!checked}>{t('save')}</button><button type="button" onClick={onCancel}>{t('cancelEdit')}</button></fieldset></form>;
}
