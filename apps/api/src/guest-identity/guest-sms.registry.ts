import {Injectable,ServiceUnavailableException} from '@nestjs/common';
export type GuestSmsMessage={phone:string;code:string;locale:'ru'|'uz'|'en';expiresInSeconds:300;idempotencyKey:string};
export interface GuestSmsDeliveryPort{send(message:GuestSmsMessage):Promise<void>;}
/** Empty by default. Concrete adapters must use the existing egress boundary;
 * registering a fixture in tests does not connect an SMS operator. */
@Injectable()
export class GuestSmsRegistry{
 private adapter:GuestSmsDeliveryPort|undefined;
 register(adapter:GuestSmsDeliveryPort){if(this.adapter)throw Error('GUEST_SMS_ALREADY_CONNECTED');this.adapter=adapter;}
 delivery(){if(!this.adapter)throw new ServiceUnavailableException('GUEST_SMS_NOT_CONNECTED');return this.adapter;}
}
