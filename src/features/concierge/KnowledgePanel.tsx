import {useState} from 'react';
import type {Locale} from '../../i18n/messages';
import {request} from '../local-core/LocalCoreWorkspace';
import {useCleaning} from '../service-orders/useCleaning';
import {knowledgePage,type KnowledgeArticle} from './support-model';
import {supportText} from './support-locale';
import {KnowledgeEditor} from './KnowledgeEditor';
export function KnowledgePanel({locale,csrf,manager,online,onPending,onSelect}:{locale:Locale;csrf:string;manager:boolean;online:boolean;onPending:(v:boolean)=>void;onSelect:(a:KnowledgeArticle)=>void}){
 const t=(k:string)=>supportText(locale,k),[opened,setOpened]=useState(false),[loading,setLoading]=useState(false),[error,setError]=useState(''),[search,setSearch]=useState(''),[query,setQuery]=useState(''),[editor,setEditor]=useState<KnowledgeArticle|null>(null),[page,setPage]=useState<{items:KnowledgeArticle[];nextCursor:string|null}>({items:[],nextCursor:null});
 async function refresh(cursor?:string,q=query){setLoading(true);setError('');try{setPage(knowledgePage(await request('service-orders/concierge/knowledge?search='+encodeURIComponent(q)+(cursor?'&cursor='+cursor:''),csrf)));setQuery(q);}catch{setPage({items:[],nextCursor:null});setError('unavailable');}finally{setLoading(false);}}
 const state=useCleaning(a=>request(a.route,csrf,a.body,a.key),async()=>{setEditor(null);await refresh();},onPending),disabled=state.busy||!!state.pending||loading||!online;
 return <section className="localPanel conciergeWorkspace" data-testid="concierge-knowledge"><h3>{t('knowledge')}</h3>{!opened?<button disabled={!online} onClick={()=>{setOpened(true);void refresh();}}>{t('openKnowledge')}</button>:<>
 {!online&&<p role="status">{t('offline')}</p>}{loading&&<p role="status">{t('loading')}</p>}{error&&<p role="alert">{t(error)}</p>}{state.message&&<p role="status">{t(state.message)}</p>}{state.pending&&<button disabled={!online||state.busy} onClick={()=>void state.act(state.pending!)}>{t('retry')}</button>}
 <form onSubmit={e=>{e.preventDefault();void refresh(undefined,search.trim());}}><fieldset disabled={disabled}><label>{t('search')}<input maxLength={80} value={search} onChange={e=>setSearch(e.target.value)}/></label><button>{t('find')}</button></fieldset></form>
 {manager&&!editor&&<button disabled={disabled} onClick={()=>setEditor({id:crypto.randomUUID(),revision:0,title:'',content:'',language:locale,active:true,updated_at:new Date().toISOString()})}>{t('newArticle')}</button>}
 {editor&&<KnowledgeEditor key={editor.id+':'+editor.revision} article={editor} locale={locale} disabled={disabled} onCancel={()=>setEditor(null)} onSave={body=>void state.act({route:'service-orders/concierge/knowledge',key:crypto.randomUUID(),body})}/>}
 {!loading&&!error&&!page.items.length&&<p>{t('emptyKnowledge')}</p>}{page.items.map(a=><article className="localPanel" key={a.id} data-article-id={a.id}><h4>{a.title}</h4><p>{a.language.toUpperCase()} · {t('version')} {a.revision} · {t(a.active?'active':'archived')}</p><p>{a.content}</p>{a.active&&<button disabled={disabled} onClick={()=>onSelect(a)}>{t('select')}</button>}{manager&&<button disabled={disabled} onClick={()=>setEditor(a)}>{t('edit')}</button>}</article>)}
 <button disabled={disabled} onClick={()=>void refresh()}>{t('refresh')}</button>{page.nextCursor&&<button disabled={disabled} onClick={()=>void refresh(page.nextCursor!)}>{t('next')}</button>}</>}</section>;
}
