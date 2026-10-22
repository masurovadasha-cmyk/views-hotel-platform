import {Controller,Get,Post,Headers,Header,HttpCode,Body,Param,Query,UnauthorizedException} from '@nestjs/common';
import {randomUUID} from 'node:crypto';
import {ConciergeSupportService} from './concierge-support.service';
import {invalid,uuid} from './service-order.input';
function actor(h:Record<string,string>){return {organizationId:uuid(h['x-organization-id']),userId:uuid(h['x-user-id']),membershipId:uuid(h['x-membership-id']),requestId:randomUUID()};}
function query(q:Record<string,unknown>,keys:string[]){if(Object.keys(q).some(k=>!keys.includes(k)))invalid();}
function bearer(h:Record<string,string>){if(typeof h.authorization!=='string'||!h.authorization.startsWith('Bearer '))throw new UnauthorizedException('SERVICE_SESSION_INVALID');return h.authorization.slice(7);}
@Controller('v1/service-orders/concierge')
export class ConciergeSupportController{
 constructor(private readonly service:ConciergeSupportService){}
 @Get('knowledge') @Header('Cache-Control','no-store') list(@Headers() h:Record<string,string>,@Query() q:Record<string,unknown>){query(q,['propertyId','cursor','search']);return this.service.knowledge(actor(h),h['x-views-staff-session'],q.propertyId,q.cursor,q.search);}
 @Post('knowledge') @HttpCode(200) @Header('Cache-Control','no-store') save(@Headers() h:Record<string,string>,@Query() q:Record<string,unknown>,@Body() b:unknown){query(q,['propertyId']);return this.service.saveKnowledge(actor(h),h['x-views-staff-session'],q.propertyId,h['idempotency-key'],b);}
 @Get(':id/profile') @Header('Cache-Control','no-store') profile(@Headers() h:Record<string,string>,@Param('id') id:string,@Query() q:Record<string,unknown>){query(q,[]);return this.service.context(actor(h),h['x-views-staff-session'],id);}
}
@Controller('v1/guest-identity/email/services/concierge/preferences')
export class ConciergePreferencesController{
 constructor(private readonly service:ConciergeSupportService){}
 @Get() @Header('Cache-Control','no-store') read(@Headers() h:Record<string,string>,@Query() q:Record<string,unknown>){query(q,['reservationId']);return this.service.preferences(bearer(h),q.reservationId);}
 @Post() @HttpCode(200) @Header('Cache-Control','no-store') save(@Headers() h:Record<string,string>,@Query() q:Record<string,unknown>,@Body() b:unknown){query(q,[]);return this.service.savePreferences(bearer(h),h['idempotency-key'],b);}
}
