import {guestEmailRequest,GuestEmailError} from './guest-email';
export type GuestTrip={id:string;confirmationCode:string;status:string;checkInAt:string;checkOutAt:string;currency:string;totalMinor:string;
 property:{name:Record<string,string>;city:string;timezone:string}};
export type GuestTripPage={items:GuestTrip[];nextCursor:string|null};
function trip(raw:unknown):GuestTrip{
 const t=raw as GuestTrip;
 if(!t||typeof t.id!=='string'||typeof t.confirmationCode!=='string'||typeof t.status!=='string'
  ||!Number.isFinite(Date.parse(t.checkInAt))||!Number.isFinite(Date.parse(t.checkOutAt))||! /^[A-Z]{3}$/.test(t.currency)
  ||typeof t.totalMinor!=='string'||! /^\d{1,19}$/.test(t.totalMinor)||!t.property||!t.property.name||typeof t.property.city!=='string'||typeof t.property.timezone!=='string')throw new GuestEmailError('GUEST_CORE_UNAVAILABLE');
 return t;
}
export const guestTrips={
 async list(cursor?:string):Promise<GuestTripPage>{
  const b=await guestEmailRequest('trips'+(cursor?'?cursor='+encodeURIComponent(cursor):''));
  if(!Array.isArray(b.items)||b.items.length>20||(b.nextCursor!==null&&(typeof b.nextCursor!=='string'||! /^[A-Za-z0-9_-]{1,300}$/.test(b.nextCursor))))throw new GuestEmailError('GUEST_CORE_UNAVAILABLE');
  return {items:b.items.map(trip),nextCursor:b.nextCursor as string|null};
 },
 async detail(id:string){return trip((await guestEmailRequest('trips/'+encodeURIComponent(id))).trip);}
};
