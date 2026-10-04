import type { AppSession } from "./auth";
import type { ServiceCategory, ServiceOrder } from "./types";
import { canSeeServiceOrder } from "./rbac";

export function mayReadServiceOrder(session:AppSession,order:ServiceOrder){
  if(session.mode==="guest") return order.guestName!==null;
  return canSeeServiceOrder(session.role,session.userId,order);
}

export function mayCreateStaffOrder(session:AppSession,category:ServiceCategory){
  if(session.mode!=="staff") return false;
  if(session.role==="general_manager"||session.role==="super_admin") return true;
  if(session.role==="front_desk") return category==="reservation_front_desk"||category==="concierge";
  if(session.role==="housekeeping_supervisor") return category==="cleaning";
  if(session.role==="maintenance_manager") return category==="maintenance";
  return false;
}
