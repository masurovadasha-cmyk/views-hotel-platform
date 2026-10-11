import {useEffect,useState} from 'react';
import {request} from '../local-core/LocalCoreWorkspace';
import {useStaffLocale} from '../local-core/StaffLocale';
import {useCleaning} from '../service-orders/useCleaning';
import type {Page} from '../service-orders/model';
import {marketText} from './locale';
import type {MarketOrder,MarketProduct} from './model';
import {MarketOrderCard} from './MarketOrderCard';
export function StaffMarket({csrf,onPending}:{csrf:string;onPending:(v:boolean)=>void}){
 const {locale}=useStaffLocale(),t=(k:string)=>marketText(locale,k);
 const [opened,setOpened]=useState(false),[loading,setLoading]=useState(false),[online,setOnline]=useState(navigator.onLine),[error,setError]=useState(''),[page,setPage]=useState<Page<MarketOrder>>({items:[],nextCursor:null});
 const [catalog,setCatalog]=useState<Page<MarketProduct>>({items:[],nextCursor:null});
 async function catalogPage(cursor?:string){setLoading(true);try{setCatalog(await request('service-orders/market/catalog'+(cursor?'?cursor='+cursor:''),csrf));}catch{setCatalog({items:[],nextCursor:null});setError('unavailable');}finally{setLoading(false);}}
 async function refresh(cursor?:string){setLoading(true);setError('');try{const [orders,products]=await Promise.all([request<Page<MarketOrder>>('service-orders/market'+(cursor?'?cursor='+cursor:''),csrf),request<Page<MarketProduct>>('service-orders/market/catalog',csrf)]);setPage(orders);setCatalog(products);}catch{setPage({items:[],nextCursor:null});setError('unavailable');}finally{setLoading(false);}}
 const state=useCleaning(a=>request(a.route,csrf,a.body,a.key),()=>refresh(),onPending);
 useEffect(()=>{const network=()=>setOnline(navigator.onLine);window.addEventListener('online',network);window.addEventListener('offline',network);return()=>{window.removeEventListener('online',network);window.removeEventListener('offline',network);};},[]);
 const disabled=state.busy||!!state.pending||loading||!online;
 return <section className="localWorkspace" data-testid="staff-market-core"><h2>{t('title')}</h2>
 {!opened?<button disabled={!online} onClick={()=>{setOpened(true);void refresh();}}>{t('open')}</button>:<><p>{t('pilot')}</p>
 {!online&&<p role="status">{t('offline')}</p>}{loading&&<p role="status">{t('loading')}</p>}{error&&<p role="alert">{t(error)}</p>}{state.message&&<p role="status">{t(state.message)}</p>}
 {state.pending&&<button disabled={state.busy||!online} onClick={()=>void state.act(state.pending!)}>{t('retry')}</button>}
 {!loading&&!error&&!page.items.length&&<p>{t('empty')}</p>}{page.items.map(o=><MarketOrderCard key={o.orderId+':'+o.revision} order={o} locale={locale} staff products={catalog.items} disabled={disabled} onAction={(action,fields={})=>void state.act({route:`service-orders/market/${o.orderId}/actions`,key:crypto.randomUUID(),body:{action,expectedRevision:o.revision,...fields}})}/>)}
 {catalog.nextCursor&&<button disabled={disabled} onClick={()=>void catalogPage(catalog.nextCursor!)}>{t('catalog')} · {t('next')}</button>}
 <button disabled={disabled} onClick={()=>void refresh()}>{t('refresh')}</button>{page.nextCursor&&<button disabled={disabled} onClick={()=>void refresh(page.nextCursor!)}>{t('next')}</button>}</>}</section>;
}
