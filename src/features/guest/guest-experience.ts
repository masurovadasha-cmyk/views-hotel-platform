import type {Apartment} from '../../domain/types';
export type GuestExploreFilter={city:string;guests:number;favoritesOnly:boolean;favorites:readonly string[];amenities:readonly string[]};
/** Filters the explicitly labelled preview catalogue; dates never imply live availability. */
export function filterGuestApartments(items:readonly Apartment[],filter:GuestExploreFilter){
 return items.filter(item=>item.city===filter.city&&item.capacity>=filter.guests&&(!filter.favoritesOnly||filter.favorites.includes(item.id))&&filter.amenities.every(amenity=>item.amenities.includes(amenity)));
}
export function guestBookingStep(screen:string){
 if(screen==='apartment')return 0;if(screen==='booking')return 1;if(screen==='guest-data')return 2;
 if(['payment','secure-processing','payment-declined'].includes(screen))return 3;return 4;
}
export type GuestServiceDraft={details:string;date:string;time:string};
export function validGuestServiceDraft(value:GuestServiceDraft){
 if(value.details.trim().length<2||value.details.length>1000)return false;
 if(value.date&&(!/^\d{4}-\d{2}-\d{2}$/.test(value.date)||!Number.isFinite(Date.parse(value.date+'T00:00:00Z'))||new Date(value.date+'T00:00:00Z').toISOString().slice(0,10)!==value.date))return false;
 return !value.time||/^([01]\d|2[0-3]):[0-5]\d$/.test(value.time);
}
