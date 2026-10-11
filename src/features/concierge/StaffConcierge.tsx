import {useEffect,useState} from 'react';
import {request} from '../local-core/LocalCoreWorkspace';
import {useStaffLocale} from '../local-core/StaffLocale';
import {ConciergeWorkspace} from './ConciergeWorkspace';
export function StaffConcierge({csrf,manager,onPending}:{csrf:string;manager:boolean;onPending:(v:boolean)=>void}){
 const {locale}=useStaffLocale(),[online,setOnline]=useState(navigator.onLine),route='service-orders/concierge';
 useEffect(()=>{const f=()=>setOnline(navigator.onLine);window.addEventListener('online',f);window.addEventListener('offline',f);return()=>{window.removeEventListener('online',f);window.removeEventListener('offline',f);};},[]);
 return <ConciergeWorkspace locale={locale} staff manager={manager} online={online} route={route} onPending={onPending}
 load={cursor=>request(route+(cursor?'?cursor='+cursor:''),csrf)} send={a=>request(a.route,csrf,a.body,a.key)}/>;
}
