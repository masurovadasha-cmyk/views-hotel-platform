import {useEffect,useMemo,useState} from 'react';
import {PartnerAssignments} from '../partner-assignments/PartnerAssignments';
import {translate} from '../partner-assignments/messages';
import type {Locale} from '../partner-assignments/model';
import {registerDraftNavigationGuard} from '../service-builder/navigation';
import {coordinationRequest,parsePartnerSession,partnerAdapter,type PartnerSession} from './adapters';
export function PartnerWorkspaceGate({local,locale}:{local:boolean;locale:Locale}){
 const [session,setSession]=useState<PartnerSession|null>(null),[loading,setLoading]=useState(local),[error,setError]=useState(false),[pending,setPending]=useState(false),[epoch,setEpoch]=useState(0);
 useEffect(()=>registerDraftNavigationGuard(()=>!pending),[pending]);
 useEffect(()=>{let alive=true;setSession(null);setError(false);setLoading(local);if(!local)return;
 const expired=()=>{setSession(null);setError(true);};window.addEventListener('views-partner-expired',expired);
 void coordinationRequest('session','partner').then(parsePartnerSession).then(s=>{if(alive)setSession(s);}).catch(()=>{if(alive)setError(true);}).finally(()=>{if(alive)setLoading(false);});
 return()=>{alive=false;window.removeEventListener('views-partner-expired',expired);};},[local,epoch]);
 useEffect(()=>{if(!session)return;const timer=setTimeout(()=>setSession(null),Math.max(0,Date.parse(session.expiresAt)-Date.now()));return()=>clearTimeout(timer);},[session]);
 const api=useMemo(()=>session?partnerAdapter(session.csrf):null,[session]);
 return <main className="localWorkspace" data-testid="partner-workspace-gate">{loading&&<p role="status">{translate(locale,'Loading…')}</p>}{error&&<p role="alert">{translate(locale,'Request failed. Existing command, if any, is retained.')}</p>}
 {local&&<button data-testid="partner-session-refresh" disabled={loading||pending} onClick={()=>setEpoch(v=>v+1)}>{translate(locale,'Refresh')}</button>}
 <PartnerAssignments locale={locale} session={session} api={api} onUnresolvedChange={setPending}/></main>;
}
