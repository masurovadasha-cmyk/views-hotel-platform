import {useEffect,useRef,useState} from 'react';
import {folioApi,folioMoney,type FolioPage,type FolioProperty} from './folio-workspace-api';
import {folioError,useFolioLocale} from './FolioWorkspaceLocale';
import {localizedName} from './staff-locale';
import {FolioWorkspaceDetail} from './FolioWorkspaceDetail';
import {FolioWorkspaceAudit} from './FolioWorkspaceAudit';
import './folio-workspace.css';
export function FolioWorkspace({staffCsrf,canManage}:{staffCsrf:string;canManage:boolean}){
 const {locale,t}=useFolioLocale();const [properties,setProperties]=useState<FolioProperty[]|null>(null),[propertyCursor,setPropertyCursor]=useState<string|null>(null),[propertyId,setPropertyId]=useState(''),[page,setPage]=useState<FolioPage|null>(null),[selected,setSelected]=useState<string|null>(null);
 const [online,setOnline]=useState(navigator.onLine),[busy,setBusy]=useState(false),[error,setError]=useState(''),[pending,setPending]=useState<'entry'|'audit'|null>(null),[changed,setChanged]=useState(false);
 const running=useRef(false),generation=useRef(0);const property=properties?.find(p=>p.id===propertyId);
 useEffect(()=>{const sync=()=>setOnline(navigator.onLine);window.addEventListener('online',sync);window.addEventListener('offline',sync);return()=>{generation.current++;window.removeEventListener('online',sync);window.removeEventListener('offline',sync);};},[]);
 async function openProperties(cursor?:string){
  if(running.current||!online||pending)return;running.current=true;setBusy(true);setError('');const turn=generation.current;
  try{const next=await folioApi.properties(staffCsrf,cursor);if(generation.current!==turn)return;setProperties(previous=>cursor?[...(previous||[]),...next.items.filter(item=>!previous?.some(p=>p.id===item.id))]:next.items);setPropertyCursor(next.nextCursor);}
  catch(e){if(generation.current===turn)setError(folioError(e));}finally{running.current=false;if(generation.current===turn)setBusy(false);}
 }
 async function load(id=propertyId,cursor?:string){
  if(running.current||!online||pending||!id)return;running.current=true;setBusy(true);setError('');setSelected(null);setPage(null);setChanged(false);const turn=generation.current;
  try{const next=await folioApi.list(staffCsrf,id,cursor);if(generation.current===turn)setPage(next);}catch(e){if(generation.current===turn)setError(folioError(e));}finally{running.current=false;if(generation.current===turn)setBusy(false);}
 }
 const locked=busy||!online||!!pending;
 return <main className="localWorkspace folioWorkspace" data-testid="folio-workspace" aria-busy={busy}>
  <h1>{t('Folios and night audit')}</h1><p className="localWarning">{t('Local test workspace. Operational charges only: this balance is not the amount payable and does not include payment settlement.')}</p>
  {!online&&<p role="status">{t('Offline. Reconnect and retry manually. Nothing is sent automatically.')}</p>}
  {!canManage&&<p>{t('Read-only access. Recording charges and running the audit require separate permission.')}</p>}
  {error&&<p className="localError" role="alert">{t(error)}</p>}
  {!properties?<button data-testid="folio-open" disabled={locked} onClick={()=>void openProperties()}>{t('Open folios')}</button>:<>
   <section className="localPanel"><label>{t('Property')}<select data-testid="folio-property" disabled={locked} value={propertyId} onChange={e=>{setPropertyId(e.target.value);setSelected(null);setPage(null);setChanged(false);setError('');}}><option value="">{t('Choose a property')}</option>{properties.map(p=><option key={p.id} value={p.id}>{localizedName(p.name,locale)}</option>)}</select></label>
    {!properties.length&&<p>{t('No properties are available to this account.')}</p>}
    {propertyCursor&&<button disabled={locked} onClick={()=>void openProperties(propertyCursor)}>{t('Load more properties')}</button>}
    <button disabled={locked||!propertyId} onClick={()=>void load()}>{t('Load folios')}</button>
    {changed&&<p role="status">{t('An operation was recorded. Reload the folio list to see current balances.')}</p>}
    {page&&!page.items.length&&<p>{t('No bookings are available for this property.')}</p>}
    <ul className="folioList">{page?.items.map(item=><li key={item.reservationId} data-testid="folio-row"><strong>{item.confirmationCode}</strong><p>{t('Operational charges balance')}: {folioMoney(item.balanceMinor,item.currency,locale)} · {t(item.status==='closed'?'Closed':item.status==='open'?'Open':'Not opened')}</p><button disabled={locked} onClick={()=>setSelected(item.reservationId)}>{t('View folio')}</button></li>)}</ul>
    {page?.nextCursor&&<button disabled={locked} onClick={()=>void load(propertyId,page.nextCursor!)}>{t('Next folios')}</button>}
   </section>
   {property&&selected&&<FolioWorkspaceDetail key={selected} reservationId={selected} staffCsrf={staffCsrf} canManage={canManage} online={online} blocked={pending==='audit'} timezone={property.timezone} onPending={value=>setPending(value?'entry':null)} onChanged={()=>setChanged(true)}/>}
   {property&&<FolioWorkspaceAudit key={property.id} property={property} staffCsrf={staffCsrf} canManage={canManage} online={online} blocked={pending==='entry'} onPending={value=>setPending(value?'audit':null)} onChanged={()=>setChanged(true)}/>}
  </>}
 </main>;
}
