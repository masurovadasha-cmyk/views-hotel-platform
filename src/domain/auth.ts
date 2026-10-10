import type { HospitalityRole } from "./types";

export type AppSession =
  | { mode:"guest"; userId:string; guestId:string; organizationId:string }
  | { mode:"staff"; userId:string; role:HospitalityRole; organizationId:string; propertyIds:string[] };

export function isManagement(role:HospitalityRole){
  return role==="general_manager"||role==="super_admin";
}
