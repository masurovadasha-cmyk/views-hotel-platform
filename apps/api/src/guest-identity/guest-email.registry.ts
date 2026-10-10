import {Injectable,ServiceUnavailableException} from '@nestjs/common';
export type GuestEmailMessage={email:string;token:string;challengeId:string;locale:'ru'|'uz'|'en';expiresInSeconds:900};
export interface GuestEmailDeliveryPort{
 /** Positive provider acceptance only; a timeout is never a success. */
 send(message:GuestEmailMessage):Promise<{accepted:true}>;
}
/** Disconnected by default. Real adapters must use the reviewed mail/egress
 * boundary. Tests explicitly register a synthetic capture adapter. */
@Injectable()
export class GuestEmailRegistry{
 private adapter:GuestEmailDeliveryPort|undefined;
 register(adapter:GuestEmailDeliveryPort){if(this.adapter)throw Error('GUEST_EMAIL_ALREADY_CONNECTED');this.adapter=adapter;}
 delivery(){if(!this.adapter)throw new ServiceUnavailableException('GUEST_EMAIL_NOT_CONNECTED');return this.adapter;}
}
