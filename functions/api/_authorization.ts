import type {LiveSession} from "./_auth";

export type StaffSession=Extract<LiveSession,{mode:"staff"}>;

export const serviceCategoriesByRole:Record<string,string[]>={
  cleaner:["cleaning"],
  housekeeping_supervisor:["cleaning"],
  concierge:["concierge","laundry","minimart","restaurant","bar","rent_car"],
  technician:["maintenance"],
  maintenance_manager:["maintenance"],
  front_desk:["reservation_front_desk","concierge"],
  reservation_manager:["reservation_front_desk"]
};

export function isManagement(role:string){
  return role==="general_manager"||role==="super_admin";
}

export function canAccessProperty(session:StaffSession,propertyId:string){
  if(!propertyId)return false;
  return session.role==="super_admin"||session.propertyIds.includes(propertyId);
}

export function canWorkServiceCategory(role:string,category:string){
  return isManagement(role)||(serviceCategoriesByRole[role]||[]).includes(category);
}

export function canVerifyHousekeeping(role:string){
  return ["housekeeping_supervisor","general_manager","super_admin"].includes(role);
}

export function canVerifyMaintenance(role:string){
  return ["maintenance_manager","general_manager","super_admin"].includes(role);
}
