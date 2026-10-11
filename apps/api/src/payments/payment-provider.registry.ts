import {Injectable} from "@nestjs/common";
import type {PaymentProviderPort,SupportedPaymentProvider} from "./payment-provider.port";

export class PaymentProviderNotConnectedError extends Error{
  constructor(provider:string){super("PAYMENT_PROVIDER_NOT_CONNECTED:"+provider);this.name="PaymentProviderNotConnectedError"}
}

@Injectable()
export class PaymentProviderRegistry{
  private readonly providers=new Map<SupportedPaymentProvider,PaymentProviderPort>();

  register(adapter:PaymentProviderPort){
    if(this.providers.has(adapter.provider))throw new Error("PAYMENT_PROVIDER_ALREADY_REGISTERED:"+adapter.provider);
    this.providers.set(adapter.provider,adapter);
  }

  get(provider:SupportedPaymentProvider){
    const adapter=this.providers.get(provider);
    if(!adapter)throw new PaymentProviderNotConnectedError(provider);
    return adapter;
  }

  connected(){return [...this.providers.keys()]}
}
