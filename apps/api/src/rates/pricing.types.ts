export type GuestChargeContext={age:number;residency:"resident"|"nonresident"};

export type DayOverride={
  stayDate:string;
  nightlyMinor:bigint|null;
  minStay:number|null;
  closed:boolean;
  closedToArrival:boolean;
  closedToDeparture:boolean;
};

export type WeekdayRule={
  isoWeekday:number;
  nightlyMinor:bigint|null;
  priceDeltaBps:number|null;
  minStay:number|null;
  closed:boolean;
  closedToArrival:boolean;
  closedToDeparture:boolean;
};

export type AdjustmentRule={
  code:string;
  triggerKind:"length_of_stay"|"early_booking"|"last_minute";
  adjustmentKind:"percentage"|"fixed";
  amountBps:number|null;
  amountMinor:bigint|null;
  minNights:number|null;
  minDaysBeforeArrival:number|null;
  maxDaysBeforeArrival:number|null;
  priority:number;
  stackable:boolean;
  effectiveFrom:string|null;
  effectiveTo:string|null;
};

export type ChargeRule={
  code:string;
  label:Record<string,string>;
  ruleKind:"percent_of_accommodation"|"fixed_per_booking"|"fixed_per_guest_night";
  rateBps:number|null;
  amountMinor:bigint|null;
  currency:string|null;
  residency:"all"|"resident"|"nonresident";
  minAge:number|null;
  compliancePolicyId?:string|null;
  ruleMetadata?:Record<string,unknown>;
};

export type PricingInput={
  checkInAt:string;
  checkOutAt:string;
  propertyTimezone:string;
  bookedAt:string;
  currency:string;
  baseNightlyMinor:bigint;
  dayOverrides:DayOverride[];
  weekdayRules:WeekdayRule[];
  adjustments:AdjustmentRule[];
  charges:ChargeRule[];
  guests:GuestChargeContext[];
};

export type QuoteLine={
  lineType:"night"|"discount"|"charge";
  code:string;
  label:Record<string,string>;
  amountMinor:bigint;
  refundable:boolean;
  metadata:Record<string,unknown>;
  sortOrder:number;
};

export type PricingResult={
  nights:number;
  accommodationMinor:bigint;
  discountMinor:bigint;
  chargesMinor:bigint;
  totalMinor:bigint;
  lines:QuoteLine[];
  pricingSnapshot:Record<string,unknown>;
};
