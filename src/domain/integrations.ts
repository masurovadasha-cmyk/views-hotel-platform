export type IntegrationProvider="booking_com"|"airbnb"|"ai_concierge";
export type IntegrationStatus="not_configured"|"credentials_required"|"partner_access_required"|"configured"|"healthy"|"degraded"|"error";

export type IntegrationDescriptor={
  provider:IntegrationProvider;
  label:string;
  status:IntegrationStatus;
  capabilities:string[];
  secretNames:string[];
};

export const integrationCatalog:IntegrationDescriptor[]=[
  {provider:"booking_com",label:"Booking.com Connectivity",status:"credentials_required",capabilities:["reservations","rates_availability","messaging","reviews","content"],secretNames:["BOOKING_CLIENT_ID","BOOKING_CLIENT_SECRET"]},
  {provider:"airbnb",label:"Airbnb Software Connection",status:"partner_access_required",capabilities:["reservations","rates_availability","listing_sync"],secretNames:["AIRBNB_PARTNER_CLIENT_ID","AIRBNB_PARTNER_CLIENT_SECRET"]},
  {provider:"ai_concierge",label:"AI Concierge",status:"credentials_required",capabilities:["guest_chat","service_triage","translation","knowledge_assistance"],secretNames:["AI_CONCIERGE_API_KEY"]}
];

export function redactedIntegrationView(item:IntegrationDescriptor){
  return {...item,secretNames:item.secretNames.map(name=>({name,configured:false}))};
}
