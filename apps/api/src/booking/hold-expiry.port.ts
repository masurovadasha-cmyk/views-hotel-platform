export type HoldExpiryJob={
  organizationId:string;
  reservationId:string;
  expiresAt:string;
};

export interface HoldExpiryQueuePort{
  schedule(job:HoldExpiryJob):Promise<void>;
  cancel(reservationId:string):Promise<void>;
}

export function holdExpiryJobId(reservationId:string){
  return "booking-hold-expire:"+reservationId;
}
