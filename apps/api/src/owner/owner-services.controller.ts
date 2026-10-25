import {Controller,Get,Header,Headers,Param,Query,UnauthorizedException} from '@nestjs/common';
import type {IncomingHttpHeaders} from 'node:http';
import {randomUUID} from 'node:crypto';
import {calendarId} from './owner-calendar.input';
import {OwnerServicesService} from './owner-services.service';
@Controller('v1/owner-services')
export class OwnerServicesController{
 constructor(private readonly services:OwnerServicesService){}
 @Get(':propertyId') @Header('Cache-Control','no-store')
 list(@Headers() h:IncomingHttpHeaders,@Param('propertyId') property:string,@Query() query:Record<string,unknown>){
  const single=(key:string)=>typeof h[key]==='string'?h[key] as string:undefined;
  let actor;try{actor={organizationId:calendarId(single('x-organization-id')),userId:calendarId(single('x-user-id')),membershipId:calendarId(single('x-membership-id')),requestId:randomUUID()};}catch{throw new UnauthorizedException('ACTOR_REQUIRED');}
  return this.services.list(actor,single('x-views-staff-session')||'',property,query);
 }
}
