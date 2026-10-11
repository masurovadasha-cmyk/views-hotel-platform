import {Body,Controller,Get,Headers,Post,UnauthorizedException,Header,Param,Query} from '@nestjs/common';
import type {IncomingHttpHeaders} from 'node:http';
import {randomUUID} from 'node:crypto';
import {requireUuid} from '../identity/actor-context';
import {OwnerRatesService} from './owner-rates.service';
import {OwnerCalendarService} from './owner-calendar.service';
import {OwnerInventoryService} from './owner-inventory.service';
function actor(h:IncomingHttpHeaders){
 try{return {organizationId:requireUuid(single(h['x-organization-id']),'organization_id'),userId:requireUuid(single(h['x-user-id']),'user_id'),membershipId:requireUuid(single(h['x-membership-id']),'membership_id'),requestId:randomUUID()};}
 catch{throw new UnauthorizedException('ACTOR_REQUIRED');}
}
function single(v:string|string[]|undefined){return typeof v==='string'?v:undefined;}
@Controller('v1/owner-inventory')
export class OwnerInventoryController{
 constructor(private readonly inventory:OwnerInventoryService,private readonly calendar:OwnerCalendarService,private readonly rates:OwnerRatesService){}
 @Get(':propertyId/rates') @Header('Cache-Control','no-store')
 ratesList(@Headers() h:IncomingHttpHeaders,@Param('propertyId') id:string){return this.rates.list(actor(h),id);}
 @Get(':propertyId/rates/:rateId') @Header('Cache-Control','no-store')
 ratesDetail(@Headers() h:IncomingHttpHeaders,@Param('propertyId') id:string,@Param('rateId') rate:string,@Query('from') from:unknown,@Query('to') to:unknown){return this.rates.detail(actor(h),id,rate,from,to);}
 @Post(':propertyId/rates/:rateId') @Header('Cache-Control','no-store')
 ratesUpdate(@Headers() h:IncomingHttpHeaders,@Param('propertyId') id:string,@Param('rateId') rate:string,@Body() body:unknown){return this.rates.update(actor(h),id,rate,body,single(h['idempotency-key'])||'');}
 @Get(':propertyId/calendar') @Header('Cache-Control','no-store')
 calendarList(@Headers() h:IncomingHttpHeaders,@Param('propertyId') id:string,@Query('from') from:unknown,@Query('to') to:unknown){return this.calendar.list(actor(h),id,from,to);}
 @Post(':propertyId/calendar') @Header('Cache-Control','no-store')
 calendarMutate(@Headers() h:IncomingHttpHeaders,@Param('propertyId') id:string,@Body() body:unknown){return this.calendar.mutate(actor(h),id,body,single(h['idempotency-key'])||'');}
 @Get() @Header('Cache-Control','no-store')
 list(@Headers() h:IncomingHttpHeaders){return this.inventory.list(actor(h));}
 @Get(':propertyId') @Header('Cache-Control','no-store')
 detail(@Headers() h:IncomingHttpHeaders,@Param('propertyId') id:string){return this.inventory.detail(actor(h),id);}
 @Post(':propertyId') @Header('Cache-Control','no-store')
 update(@Headers() h:IncomingHttpHeaders,@Param('propertyId') id:string,@Body() body:unknown){return this.inventory.update(actor(h),id,body,single(h['idempotency-key'])||'');}
 @Post() @Header('Cache-Control','no-store')
 create(@Headers() h:IncomingHttpHeaders,@Body() body:unknown){return this.inventory.create(actor(h),body,single(h['idempotency-key'])||'');}
}
