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
