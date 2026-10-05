export type GuestAuthChannel="email"|"sms";

export type GuestAuthDeliveryInput={
  organizationId:string;
  reservationId:string;
  destination:string;
  exchangeToken:string;
  expiresAt:string;
};

export type GuestAuthDeliveryResult={
  messageId?:string;
};

export interface GuestAuthDeliveryPort{
  readonly channel:GuestAuthChannel;
  send(input:GuestAuthDeliveryInput):Promise<GuestAuthDeliveryResult>;
}
