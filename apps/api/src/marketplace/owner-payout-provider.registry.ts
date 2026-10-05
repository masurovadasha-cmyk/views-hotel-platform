import {Injectable} from "@nestjs/common";
import type {OwnerPayoutProviderPort} from "./owner-payout-provider.port";

export class OwnerPayoutProviderNotConnectedError extends Error{
  constructor(provider:string){
    super("PAYOUT_PROVIDER_NOT_CONNECTED:"+provider);
    this.name="OwnerPayoutProviderNotConnectedError";
  }
}

@Injectable()
export class OwnerPayoutProviderRegistry{
  private readonly providers=new Map<string,OwnerPayoutProviderPort>();

  register(adapter:OwnerPayoutProviderPort){
    const provider=adapter.provider.trim().toLowerCase();
    if(!/^[a-z0-9_-]{1,80}$/.test(provider))throw new Error("INVALID_PAYOUT_PROVIDER");
    if(this.providers.has(provider))throw new Error("PAYOUT_PROVIDER_ALREADY_REGISTERED:"+provider);
    this.providers.set(provider,adapter);
  }

  get(provider:string){
    const normalized=provider.trim().toLowerCase();
    const adapter=this.providers.get(normalized);
    if(!adapter)throw new OwnerPayoutProviderNotConnectedError(normalized);
    return adapter;
  }

  connected(){return [...this.providers.keys()].sort()}
}
