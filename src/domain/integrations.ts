export type IntegrationProvider="booking_com"|"airbnb"|"ai_concierge";
export type IntegrationStatus="not_configured"|"credentials_required"|"partner_access_required"|"configured"|"healthy"|"degraded"|"error";

export type IntegrationDescriptor={
  provider:IntegrationProvider;
  label:string;
  status:IntegrationStatus;
  capabilities:string[];
  credentialSlots:string[];
};

export const integrationCatalog:IntegrationDescriptor[]=[
  {provider:"booking_com",label:"Booking.com Connectivity",status:"credentials_required",capabilities:["reservations","rates_availability","messaging","reviews","content"],credentialSlots:["client_id","client_secret"]},
  {provider:"airbnb",label:"Airbnb Software Connection",status:"partner_access_required",capabilities:["reservations","rates_availability","listing_sync"],credentialSlots:["partner_client_id","partner_client_secret"]},
  {provider:"ai_concierge",label:"AI Concierge",status:"credentials_required",capabilities:["guest_chat","service_triage","translation","knowledge_assistance"],credentialSlots:["api_key"]}
];

export function publicIntegrationView(item:IntegrationDescriptor){
  return {...item,credentialSlots:item.credentialSlots.map(name=>({name,configured:false}))};
}
