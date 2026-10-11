import type { ServiceCategory } from "./types";

const guestCategories:ServiceCategory[]=["concierge","cleaning","laundry","minimart","restaurant","bar","rent_car"];

export function validateGuestRequest(input:{reservationId:string;category:string;title:string;details:string}){
  const errors:string[]=[];
  if(!input.reservationId.trim())errors.push("reservation_required");
  if(!guestCategories.includes(input.category as ServiceCategory))errors.push("category_not_allowed");
  if(input.title.trim().length<2||input.title.length>160)errors.push("invalid_title");
  if(input.details.trim().length<2||input.details.length>2000)errors.push("invalid_details");
  return {valid:errors.length===0,errors};
}
