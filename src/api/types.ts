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
