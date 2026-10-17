import {Controller,Post,Param,Headers,Header,UnauthorizedException} from '@nestjs/common';
import {randomUUID} from 'node:crypto';
import {requireUuid} from '../identity/actor-context';
import {BookingCancellationService} from './booking-cancellation.service';
@Controller('v1/bookings')
export class BookingCancellationController{
 constructor(private readonly cancellations:BookingCancellationService){}
 @Post(':id/cancel') @Header('Cache-Control','no-store')
 cancel(@Param('id') id:string,@Headers('idempotency-key') key:string,@Headers('x-organization-id') org:string,@Headers('x-user-id') user:string,@Headers('x-membership-id') member:string){
  let actor;try{actor={organizationId:requireUuid(org,'organization_id'),userId:requireUuid(user,'user_id'),membershipId:requireUuid(member,'membership_id'),requestId:randomUUID()};}catch{throw new UnauthorizedException('ACTOR_REQUIRED');}
  return this.cancellations.cancel(actor,id,key);
 }
}
