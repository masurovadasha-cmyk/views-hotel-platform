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
