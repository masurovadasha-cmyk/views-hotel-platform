export type FrontDeskAction="check_in"|"check_out";

export function nextReservationStatus(status:string,action:FrontDeskAction){
  if(action==="check_in"&&["confirmed","assigned"].includes(status))return "checked_in";
  if(action==="check_out"&&status==="checked_in")return "completed";
  return null;
}

export function canOperateFrontDesk(role:string){
  return ["front_desk","reservation_manager","general_manager","super_admin"].includes(role);
}

export function checkInUnitAllowed(status:string){
  return ["available","ready"].includes(status);
}
