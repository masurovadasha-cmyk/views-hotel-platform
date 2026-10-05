export type LiveBooking={
  id:string;
  confirmation_code:string;
  status:string;
  check_in_date:string;
  check_out_date:string;
  total_amount:number|null;
  currency:string;
  property_name:string;
  city:string;
  unit_code:string|null;
};

export type LiveServiceOrder={
  id:string;
  title:string;
  category:string;
  status:string;
  priority:string;
  assigned_user_id:string|null;
  unit_id:string|null;
  guest_id:string|null;
  reservation_id:string|null;
  version:number;
  created_at:string;
};

export type LiveHousekeepingJob={
  id:string;
  property_id:string;
  unit_id:string;
  unit_code:string;
  reservation_id:string|null;
  assigned_user_id:string|null;
  status:string;
  created_at:string;
  started_at:string|null;
  completed_at:string|null;
  verified_at:string|null;
};

export type LiveMaintenanceTicket={
  id:string;
  property_id:string;
  unit_id:string|null;
  unit_code:string|null;
  assigned_user_id:string|null;
  title:string;
  description:string|null;
  priority:string;
  status:string;
  created_at:string;
  resolved_at:string|null;
};

export type LiveFrontDeskReservation={
  id:string;
  confirmation_code:string;
  status:string;
  check_in_date:string;
  check_out_date:string;
  version:number;
  unit_id:string|null;
  unit_code:string|null;
  unit_status:string|null;
  guest_id:string;
  first_name:string;
  last_name:string;
  vip:number;
  stay_id:string|null;
  stay_status:string|null;
  checked_in_at:string|null;
  checked_out_at:string|null;
};

export type LiveLostFoundItem={
  id:string; unit_id:string|null; unit_code:string|null; item_name:string; description:string|null;
  found_location:string|null; found_at:string; status:string; created_at:string;
};

export type LiveDamageReport={
  id:string; unit_id:string|null; unit_code:string|null; severity:string; title:string;
  description:string|null; status:string; created_at:string; resolved_at:string|null;
};

export type LiveInventoryItem={
  id:string; category:string; name:string; sku:string|null; quantity:number; par_level:number;
  unit_of_measure:string; updated_at:string;
};

export type LiveShiftHandover={
  id:string; property_id:string; from_shift:string; to_shift:string;
  unresolved:unknown[]; risks:unknown[]; followUp:unknown[];
  created_by:string|null; acknowledged_by:string|null; created_at:string; acknowledged_at:string|null;
};

export type LiveGuestProfile={
  id:string; first_name:string; last_name:string; email:string|null; phone:string|null; vip:number; created_at:string;
};

export type LiveGuestReservation={
  id:string; confirmation_code:string; status:string; check_in_date:string; check_out_date:string;
  unit_id:string|null; unit_code:string|null; stay_status:string|null; checked_in_at:string|null; checked_out_at:string|null;
};

export type LivePropertyUnit={
  id:string; code:string; name:string; status:string; capacity:number; bedrooms:number;
};

export type LiveTimelineEvent={
  source:"reservation"|"service_order"|"housekeeping"|"maintenance";
  event_type:string; from_status:string|null; to_status:string|null; payload:string; created_at:string;
};

export type LiveStaffWorkload={
  userId:string;
  displayName:string;
  role:string;
  openServiceOrders:number;
  openHousekeeping:number;
  openMaintenance:number;
  activeTasks:number;
  serviceDoneToday:number;
};

export type LiveTeamSummary={
  activeServiceOrders:number;
  unassignedServiceOrders:number;
  activeHousekeeping:number;
  activeMaintenance:number;
};

export type LiveIntegrationStatus={
  provider:string;
  status:string;
  scopes:string[];
  lastHealthAt:string|null;
  lastSyncAt:string|null;
  lastErrorCode:string|null;
  updatedAt:string;
};

export type LiveStaffOverview={
  property:{id:string;name:string;city:string};
  role:string;
  counts:{
    serviceOrdersOpen:number;
    housekeepingOpen:number|null;
    maintenanceOpen:number|null;
    arrivals:number|null;
    inHouse:number|null;
    readyUnits:number|null;
  };
  recentServiceOrders:Array<{
    id:string;title:string;category:string;status:string;priority:string;
    assigned_user_id:string|null;unit_id:string|null;version:number;created_at:string;
  }>;
  arrivalItems:Array<{
    id:string;confirmation_code:string;status:string;check_in_date:string;check_out_date:string;
    unit_code:string|null;first_name:string;last_name:string;vip:number;
  }>;
};
