import type {RequestActorContext} from "../identity/actor-context";
import type {GuestChargeContext,QuoteLine} from "./pricing.types";
import type {CancellationPolicySnapshot} from "./cancellation";

export type CreateQuoteInput={
  actor:RequestActorContext;
  propertyId:string;
  unitId:string;
  ratePlanId:string;
  checkInAt:string;
  checkOutAt:string;
  guests:GuestChargeContext[];
};

export type QuoteResult={
  quoteId:string;
  currency:string;
  nights:number;
  accommodationMinor:bigint;
  discountMinor:bigint;
  chargesMinor:bigint;
  totalMinor:bigint;
  expiresAt:string;
  lines:QuoteLine[];
  cancellationPolicy:CancellationPolicySnapshot;
};
