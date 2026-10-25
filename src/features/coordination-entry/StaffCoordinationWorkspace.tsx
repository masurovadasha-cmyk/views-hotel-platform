import {useEffect,useMemo,useState} from 'react';
import {PartnerDispatch} from '../partner-assignments/PartnerAssignments';
import {translate} from '../partner-assignments/messages';
import {useStaffLocale} from '../local-core/StaffLocale';
import {SlaPolicyWorkspace} from '../sla-policy/SlaPolicyWorkspace';
import {registerDraftNavigationGuard} from '../service-builder/navigation';
import {coordinationRequest,dispatchAdapter,parseDispatchWorkspace} from './adapters';
export function StaffCoordinationWorkspace({csrf,kind,onPending}:{csrf:string;kind:'dispatch'|'sla';onPending:(pending:boolean)=>void}){
 const {locale}=useStaffLocale(),[scope,setScope]=useState<ReturnType<typeof parseDispatchWorkspace>|null>(null),[error,setError]=useState(false),[epoch,setEpoch]=useState(0),[pending,setPending]=useState(false);
 useEffect(()=>{onPending(pending);return()=>onPending(false);},[pending,onPending]);
 useEffect(()=>registerDraftNavigationGuard(()=>!pending),[pending]);
 useEffect(()=>{let alive=true;setScope(null);setError(false);void coordinationRequest('workspace','staff',csrf).then(parseDispatchWorkspace).then(s=>{if(alive)setScope(s);}).catch(()=>{if(alive)setError(true);});return()=>{alive=false;};},[csrf,epoch]);
 const api=useMemo(()=>dispatchAdapter(csrf),[csrf]);
 return <section className="localWorkspace" data-testid={'staff-coordination-'+kind}>{error?<><p role="alert">{translate(locale,'Request failed. Existing command, if any, is retained.')}</p><button onClick={()=>setEpoch(v=>v+1)}>{translate(locale,'Refresh')}</button></>:!scope?<p role="status">{translate(locale,'Loading…')}</p>:kind==='dispatch'?<PartnerDispatch locale={locale} session={scope} api={api} onUnresolvedChange={setPending}/>:<SlaPolicyWorkspace propertyId={scope.propertyId} staffCsrf={csrf} onUnresolvedChange={setPending}/>}</section>;
}
