export const bookingChannels=[
  "staff_crm","guest_app","host_portal","marketplace_api","import"
] as const;

export const attributionSources=[
  "staff_actor","authenticated_guest","trusted_integration","import"
] as const;

export type BookingChannel=typeof bookingChannels[number];
export type AttributionSource=typeof attributionSources[number];

export type BookingAttributionInput={
  bookingChannel?:BookingChannel|null;
  marketSegment?:string|null;
  source?:AttributionSource|null;
};

export type NormalizedBookingAttribution={
  bookingChannel:BookingChannel|null;
  marketSegment:string|null;
  source:AttributionSource|null;
};

export function normalizeBookingAttribution(
  input:BookingAttributionInput|undefined
):NormalizedBookingAttribution{
  if(!input){
    return {bookingChannel:null,marketSegment:null,source:null};
  }

  const bookingChannel=input.bookingChannel??null;
  if(bookingChannel!==null&&!bookingChannels.includes(bookingChannel)){
    throw new Error("INVALID_BOOKING_CHANNEL");
  }

  const source=input.source??null;
  if(source!==null&&!attributionSources.includes(source)){
    throw new Error("INVALID_ATTRIBUTION_SOURCE");
  }

  return {
    bookingChannel,
    marketSegment:normalizeMarketSegment(input.marketSegment),
    source
  };
}

export function normalizeMarketSegment(value:string|null|undefined){
  if(value===null||value===undefined)return null;
  const trimmed=value.trim();
  if(!trimmed)return null;
  const normalized=trimmed
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g,"_")
    .replace(/^_+|_+$/g,"")
    .slice(0,64);
  if(!normalized||!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(normalized)){
    throw new Error("INVALID_MARKET_SEGMENT");
  }
  return normalized;
}
