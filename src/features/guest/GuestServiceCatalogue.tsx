import {Car,ConciergeBell,Flower2,MapPin,Plane,Shirt,ShoppingBag,Sparkles,TrainFront,UtensilsCrossed,Wine} from 'lucide-react';
import {useGuestLocale} from './GuestLocale';
import {additionalServices,primaryServices,type GuestService} from './service-catalog';
const icons={cleaning:Sparkles,laundry:Shirt,market:ShoppingBag,concierge:ConciergeBell,transfer:Plane,car:Car,excursions:MapPin,tickets:TrainFront,restaurant:UtensilsCrossed,bar:Wine,spa:Flower2};
export function GuestServiceCatalogue({selected,onSelect,large=false}:{selected?:string;onSelect:(id:string)=>void;large?:boolean}){
 const {t}=useGuestLocale();
 function cards(services:readonly GuestService[]){return services.map(service=>{const Icon=icons[service.icon];return <button key={service.id} data-service={service.id} className={selected===service.id?'selectedService':''} aria-pressed={selected===undefined?undefined:selected===service.id} onClick={()=>onSelect(service.id)}><Icon aria-hidden="true"/><b>{t(service.name)}</b><small>{t(service.description)}</small>{service.requestCategory===null&&<small className="serviceAvailability">{t('Not connected yet')}</small>}</button>;});}
 return <div className="guestServiceCatalogue"><div className={'serviceGrid'+(large?' large':'')} data-testid="primary-services">{cards(primaryServices)}</div><h3>{t('More at the property')}</h3><div className="serviceGrid additionalServices" data-testid="additional-services">{cards(additionalServices)}</div></div>;
}
