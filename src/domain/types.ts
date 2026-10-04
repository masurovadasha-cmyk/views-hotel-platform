export type HospitalityRole =
  | "cleaner" | "concierge" | "technician" | "front_desk"
  | "housekeeping_supervisor" | "maintenance_manager"
  | "reservation_manager" | "finance_manager" | "accountant"
  | "revenue_manager" | "owner_readonly" | "general_manager" | "super_admin";

export type ServiceCategory =
  | "concierge" | "cleaning" | "laundry" | "minimart"
  | "restaurant" | "bar" | "rent_car" | "spa" | "maintenance" | "reservation_front_desk";

export type ServiceOrderStatus =
  | "new" | "assigned" | "accepted" | "in_progress" | "waiting"
  | "done" | "closed" | "cancelled" | "dnd" | "service_declined";

export type Priority = "low" | "normal" | "high" | "urgent";

export type Apartment = {
  id:string; title:string; property:string; city:string; capacity:number;
  bedrooms:number; bathrooms:number; nightlyRate:number|null; currency:string;
  image:string; amenities:string[];
};

export type ServiceOrder = {
  id:string; title:string; category:ServiceCategory; status:ServiceOrderStatus;
  priority:Priority; assigneeUserId:string|null; unit:string|null;
  guestName:string|null; slaMinutes:number; history:string[]; version?:number;
};
