import type {RequestActorContext} from "../identity/actor-context";

export type PriceLineInput={
  type:string;
  label:Record<string,string>;
  amountMinor:bigint;
  currency:string;
  taxMetadata?:Record<string,unknown>;
  sortOrder?:number;
};

export type CreateHoldInput={
  actor:RequestActorContext;
  propertyId:string;
  unitId:string;
  ratePlanId:string;
  checkInAt:string;
  checkOutAt:string;
  currency:string;
  priceLines:PriceLineInput[];
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
