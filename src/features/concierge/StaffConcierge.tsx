import {conciergeQueueRoute} from './queue';
import {KnowledgePanel} from './KnowledgePanel';
import type {KnowledgeArticle} from './support-model';
import {useEffect,useState} from 'react';
import {request} from '../local-core/LocalCoreWorkspace';
import {useStaffLocale} from '../local-core/StaffLocale';
import {ConciergeWorkspace} from './ConciergeWorkspace';
export function StaffConcierge({csrf,manager,onPending}:{csrf:string;manager:boolean;onPending:(v:boolean)=>void}){
 const [conversationPending,setConversationPending]=useState(false),[knowledgePending,setKnowledgePending]=useState(false),[snippet,setSnippet]=useState<KnowledgeArticle|null>(null);
 useEffect(()=>onPending(conversationPending||knowledgePending),[conversationPending,knowledgePending,onPending]);
 const {locale}=useStaffLocale(),[online,setOnline]=useState(navigator.onLine),route='service-orders/concierge';
 useEffect(()=>{const f=()=>setOnline(navigator.onLine);window.addEventListener('online',f);window.addEventListener('offline',f);return()=>{window.removeEventListener('online',f);window.removeEventListener('offline',f);};},[]);
 return <><KnowledgePanel csrf={csrf} locale={locale} manager={manager} online={online} onPending={setKnowledgePending} onSelect={setSnippet}/><ConciergeWorkspace staffCsrf={csrf} snippet={snippet} locale={locale} staff manager={manager} online={online} route={route} onPending={setConversationPending}
 load={(cursor,overdue)=>request(conciergeQueueRoute(!!overdue,cursor),csrf)} send={a=>request(a.route,csrf,a.body,a.key)}/></>;
}
