import {Injectable} from "@nestjs/common";
import type {GuestAuthChannel,GuestAuthDeliveryPort} from "./guest-auth-delivery.port";

@Injectable()
export class GuestAuthProviderRegistry{
  private readonly deliveries=new Map<GuestAuthChannel,GuestAuthDeliveryPort>();

  register(provider:GuestAuthDeliveryPort){
    if(this.deliveries.has(provider.channel))throw new Error("GUEST_AUTH_DELIVERY_ALREADY_REGISTERED");
    this.deliveries.set(provider.channel,provider);
  }

  delivery(channel:GuestAuthChannel){
    const provider=this.deliveries.get(channel);
    if(!provider)throw new Error("GUEST_AUTH_DELIVERY_NOT_CONNECTED");
    return provider;
  }

  connected(){
    return [...this.deliveries.keys()].sort();
  }
}
