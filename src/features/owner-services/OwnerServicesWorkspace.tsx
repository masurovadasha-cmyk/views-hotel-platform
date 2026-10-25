import {useEffect,useRef,useState} from 'react';
import {request} from '../local-core/LocalCoreWorkspace';
import {useStaffLocale} from '../local-core/StaffLocale';
import {localizedName,formatStaffMoney} from '../local-core/staff-locale';
import {ownerServicesText} from './locale';
type Property={id:string;name:Record<string,string>;status:string};
type Item={id:string;name:Record<string,string>|null;priceMinor?:string;status?:'requested'|'accepted'|'in_progress';quantity?:number};
type Page={propertyId:string;kind:'catalog'|'orders';items:Item[];nextCursor:string|null;readOnly:true};
export function OwnerServicesWorkspace({staffCsrf}:{staffCsrf:string}){
 const {locale}=useStaffLocale(),t=(key:Parameters<typeof ownerServicesText>[1])=>ownerServicesText(locale,key);
 const [properties,setProperties]=useState<Property[]>([]),[property,setProperty]=useState(''),[kind,setKind]=useState<'catalog'|'orders'>('catalog'),[after,setAfter]=useState(''),[refresh,setRefresh]=useState(0),[data,setData]=useState<Page|null>(null),[error,setError]=useState(false),[loading,setLoading]=useState(false);
 const generation=useRef(0);
 useEffect(()=>{let alive=true;setProperties([]);request<{properties:Property[]}>('owner-inventory',staffCsrf).then(r=>{if(alive){const active=r.properties.filter(p=>p.status==='active');setProperties(active);setProperty(current=>active.some(p=>p.id===current)?current:'');}}).catch(()=>{if(alive)setError(true);});return()=>{alive=false;};},[staffCsrf,refresh]);
 useEffect(()=>{
  const token=++generation.current;setData(null);setError(false);setLoading(!!property);
  if(property)request<Page>(`owner-services/${property}?kind=${kind}&limit=20${after?'&after='+encodeURIComponent(after):''}`,staffCsrf).then(r=>{if(generation.current===token){if(r.propertyId!==property||r.kind!==kind||r.readOnly!==true)throw Error();setData(r);}}).catch(()=>{if(generation.current===token)setError(true);}).finally(()=>{if(generation.current===token)setLoading(false);});
  return()=>{generation.current++;};
 },[staffCsrf,property,kind,after,refresh]);
 useEffect(()=>{const clear=()=>{generation.current++;setData(null);setLoading(false);setError(true);};window.addEventListener('offline',clear);window.addEventListener('views-staff-expired',clear);return()=>{window.removeEventListener('offline',clear);window.removeEventListener('views-staff-expired',clear);};},[]);
 return <section id="staff-owner-services" className="localWorkspace" tabIndex={-1}><h2>{t('title')}</h2><p>{t('scope')}</p>
 <label>{t('property')}<select value={property} onChange={e=>{setData(null);setProperty(e.target.value);setAfter('');}}><option value="">{t('choose')}</option>{properties.map(p=><option key={p.id} value={p.id}>{localizedName(p.name,locale)}</option>)}</select></label>
 <label>{t('title')}<select value={kind} onChange={e=>{setData(null);setKind(e.target.value as 'catalog'|'orders');setAfter('');}}><option value="catalog">{t('catalog')}</option><option value="orders">{t('orders')}</option></select></label>
 <button onClick={()=>{setData(null);setAfter('');setRefresh(v=>v+1);}}>{t('refresh')}</button>
 {loading&&<p role="status">{t('loading')}</p>}{error&&<p role="alert">{t('error')}</p>}{data&&data.items.length===0&&<p>{t('empty')}</p>}
 <ul>{data?.items.map(row=><li key={row.id}><strong>{localizedName(row.name||{},locale)}</strong> {row.priceMinor!==undefined&&formatStaffMoney(row.priceMinor,locale)} {row.status&&t(row.status)} {row.quantity!==undefined&&`${t('quantity')}: ${row.quantity}`}</li>)}</ul>
 {after&&<button onClick={()=>{setData(null);setAfter('');}}>{t('back')}</button>}{data?.nextCursor&&<button onClick={()=>{setData(null);setAfter(data.nextCursor!);}}>{t('next')}</button>}
 </section>;
}
