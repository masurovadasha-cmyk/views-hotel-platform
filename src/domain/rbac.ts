import type { HospitalityRole, ServiceCategory, ServiceOrder } from "./types";

export const roleNavigation:Record<HospitalityRole,string[]>={
  cleaner:["overview","my-tasks"],
  concierge:["overview","inbox","my-tasks","messages"],
  technician:["overview","my-tasks"],
  front_desk:["overview","inbox","front-desk","guests"],
  housekeeping_supervisor:["overview","inbox","housekeeping","team"],
  maintenance_manager:["overview","inbox","maintenance","team"],
  reservation_manager:["overview","inbox","front-desk","guests"],
  finance_manager:["finance"], accountant:["finance"], revenue_manager:["finance"],
  owner_readonly:["host","finance"],
  general_manager:["overview","inbox","operations","front-desk","guests","housekeeping","maintenance","host","finance","admin","team"],
  super_admin:["overview","inbox","operations","front-desk","guests","housekeeping","maintenance","host","finance","admin","team"]
};

const categories:Partial<Record<HospitalityRole,ServiceCategory[]>>={
  cleaner:["cleaning"], housekeeping_supervisor:["cleaning"],
  concierge:["concierge","laundry","minimart","restaurant","bar","rent_car"],
  technician:["maintenance"], maintenance_manager:["maintenance"],
  front_desk:["reservation_front_desk","concierge"], reservation_manager:["reservation_front_desk"]
};

export function canSeeServiceOrder(role:HospitalityRole,userId:string,order:ServiceOrder){
  if(role==="general_manager"||role==="super_admin")return true;
  const allowed=categories[role];
  if(!allowed?.includes(order.category))return false;
  if((role==="cleaner"||role==="technician")&&order.assigneeUserId!==userId)return false;
  return true;
}
