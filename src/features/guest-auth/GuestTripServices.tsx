import {useId,useRef,useState} from 'react';
import {Brush,Shirt,MessageCircle,ShoppingBag} from 'lucide-react';
import {GuestCleaning} from '../service-orders/GuestCleaning';
import {GuestLaundry} from '../laundry/GuestLaundry';
import {GuestConcierge} from '../concierge/GuestConcierge';
import {GuestMarket} from '../market-core/GuestMarket';
import {useGuestLocale} from '../guest/GuestLocale';
import {translate} from '../../i18n/messages';
import catalog from './guest-trips-translations.json';

const services={
 cleaning:{title:'Cleaning',icon:Brush,Panel:GuestCleaning},
 laundry:{title:'Laundry',icon:Shirt,Panel:GuestLaundry},
 concierge:{title:'Concierge',icon:MessageCircle,Panel:GuestConcierge},
 market:{title:'V Market',icon:ShoppingBag,Panel:GuestMarket},
};
type Service=keyof typeof services;
type Props={reservationId:string;csrf:string;online:boolean;canRequest:boolean;blocked:boolean;
 onExpired:()=>void;onPending:Record<Service,(pending:boolean)=>void>};

export function GuestTripServices({blocked,onPending,...common}:Props){
 const {locale}=useGuestLocale(),t=(s:string)=>translate(catalog,locale,s),id=useId();
 const [active,setActive]=useState<Service|null>(null),[visited,setVisited]=useState<Service[]>([]);
 const buttons=useRef<Partial<Record<Service,HTMLButtonElement|null>>>({});
 function open(kind:Service){if(blocked)return;setVisited(old=>old.includes(kind)?old:[...old,kind]);setActive(kind);}
 function back(){if(blocked||!active)return;buttons.current[active]?.focus();setActive(null);}
 return <section className="guestTripServices" data-testid="guest-trip-services" aria-labelledby={id}>
  <h3 id={id}>{t('My orders')}</h3>
  <p>{t(common.canRequest?'Choose a service to view orders or make a request.':'History for a completed stay. New orders are unavailable.')}</p>
  <nav className="guestServiceChoices" aria-label={t('Choose a service')}>
   {(Object.keys(services) as Service[]).map(kind=>{const {title,icon:Icon}=services[kind];return <button key={kind}
    ref={button=>{buttons.current[kind]=button;}} id={id+'-'+kind} type="button" data-testid={'guest-service-'+kind} aria-pressed={active===kind}
    aria-controls={visited.includes(kind)?id+'-panel-'+kind:undefined} disabled={blocked} onClick={()=>open(kind)}>
    <Icon size={22} aria-hidden="true"/><span>{t(title)}</span>
   </button>;})}
  </nav>
  {blocked&&<p role="status">{t('Confirm the pending operation before switching services.')}</p>}
  {active&&<button type="button" data-testid="guest-services-back" disabled={blocked} onClick={back}>{t('Back to services')}</button>}
  {/* Keep drafts and retry keys in memory; the trip/session boundary unmounts every panel. */}
  {visited.map(kind=>{const {Panel}=services[kind];return <div key={kind} id={id+'-panel-'+kind}
   role="region" aria-labelledby={id+'-'+kind} data-testid={'guest-service-panel-'+kind} hidden={active!==kind}>
   <Panel {...common} onPending={onPending[kind]}/>
  </div>;})}
 </section>;
}
