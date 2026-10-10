import type {RequestActorContext} from "../identity/actor-context";

export type CreateHoldInput={
  actor:RequestActorContext;
  quoteId:string;
  idempotencyKey:string;
  ttlSeconds?:number;
};

export type HoldResult={
  reservationId:string;
  confirmationCode:string;
  status:"hold";
  holdExpiresAt:string;
  totalMinor:bigint;
  currency:string;
  idempotentReplay:boolean;
};
