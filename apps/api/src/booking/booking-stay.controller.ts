import {BadRequestException,Body,Controller,Headers,HttpCode,Param,Post,UnauthorizedException} from '@nestjs/common';
import type {IncomingHttpHeaders} from 'node:http';
import {randomUUID} from 'node:crypto';
import {requireUuid} from '../identity/actor-context';
import {BookingStayService} from './booking-stay.service';
@Controller('v1/bookings')
export class BookingStayController{
 constructor(private readonly stays:BookingStayService){}
 @Post(':id/stay/:action') @HttpCode(200)
 async transition(@Headers() headers:IncomingHttpHeaders,@Param('id') id:string,@Param('action') action:string,@Body() body:unknown){
  if(headers['x-views-service-id']!=='local-workspace')throw new UnauthorizedException('STAFF_GATEWAY_REQUIRED');
  if(!body||Array.isArray(body)||typeof body!=='object'||(action!=='guest'&&Object.keys(body).length)||!['check-in','check-out','guest'].includes(action))throw new BadRequestException('INVALID_STAY_REQUEST');
  const single=(name:string)=>typeof headers[name]==='string'?headers[name] as string:undefined;
  let actor,key;
  try{actor={organizationId:requireUuid(single('x-organization-id'),'organization_id'),userId:requireUuid(single('x-user-id'),'user_id'),membershipId:requireUuid(single('x-membership-id'),'membership_id'),requestId:randomUUID()};
   id=requireUuid(id,'reservation_id');key=requireUuid(single('idempotency-key'),'idempotency_key');
  }catch{throw new BadRequestException('INVALID_STAY_REQUEST');}
  return this.stays.transition(actor,single('x-views-staff-session')||'',id,key,action as 'check-in'|'check-out'|'guest',body);
 }
}
