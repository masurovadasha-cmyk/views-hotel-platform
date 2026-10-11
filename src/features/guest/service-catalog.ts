/** Presentation catalogue. Existing legacy request codes stay stable; new services have no request adapter. */
export const primaryServices = [
 {id:'cleaning',name:'Cleaning',icon:'cleaning',description:'Cleaning for your stay',requestCategory:'cleaning'},
 {id:'laundry',name:'Laundry',icon:'laundry',description:'Care for your clothes',requestCategory:'laundry'},
 {id:'minimart',name:'V Market',icon:'market',description:'Everyday essentials',requestCategory:'minimart'},
 {id:'concierge',name:'Concierge',icon:'concierge',description:'Help with your plans',requestCategory:'concierge'},
 {id:'transfer',name:'Transfers',icon:'transfer',description:'Airport and city journeys',requestCategory:null},
 {id:'rent_car',name:'Rent Car',icon:'car',description:'A car for your dates',requestCategory:'rent_car'},
 {id:'excursions',name:'Excursions',icon:'excursions',description:'Discover the city',requestCategory:null},
 {id:'tickets',name:'Flights & trains',icon:'tickets',description:'Plan your onward journey',requestCategory:null},
] as const;
export const additionalServices = [
 {id:'restaurant',name:'Restaurant',icon:'restaurant',description:'Dining during your stay',requestCategory:'restaurant'},
 {id:'bar',name:'Bar',icon:'bar',description:'Drinks and refreshments',requestCategory:'bar'},
 {id:'spa',name:'Spa & Wellness',icon:'spa',description:'Time to unwind',requestCategory:'spa'},
] as const;
export const guestServices=[...primaryServices,...additionalServices];
export type GuestService=typeof guestServices[number];
export function findGuestService(id:string):GuestService|undefined{return guestServices.find(service=>service.id===id);}
export function guestRequestCategory(id:string){return findGuestService(id)?.requestCategory??null;}
