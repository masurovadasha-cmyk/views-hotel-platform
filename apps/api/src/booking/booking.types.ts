import type {RequestActorContext} from "../identity/actor-context";

export type CreateHoldInput={
  actor:RequestActorContext;
  quoteId:string;
  idempotencyKey:string;
  ttlSeconds?:number;
  staffSession?:string;
  recoveryOnly?:boolean;
  propertyId?:string;
};

export type HoldResult={
  reservationId:string;
  confirmationCode:string;
  status:"hold"|"pending"|"confirmed"|"checked_in"|"checked_out"|"cancelled"|"no_show";
  activeHold:boolean;
  holdExpiresAt:string|null;
  totalMinor:bigint;
  currency:string;
  idempotentReplay:boolean;
};
