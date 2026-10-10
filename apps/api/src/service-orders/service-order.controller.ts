import {Controller,Get,Post,Headers,Header,HttpCode,Body,Param,Query,UnauthorizedException} from '@nestjs/common';
import {randomUUID} from 'node:crypto';
import {ServiceOrderService} from './service-order.service';
import {invalid,uuid} from './service-order.input';
function bearer(h:Record<string,string>){const value=h.authorization;if(typeof value!=='string'||!value.startsWith('Bearer '))throw new UnauthorizedException('SERVICE_SESSION_INVALID');return value.slice(7);}
function actor(h:Record<string,string>){return {organizationId:uuid(h['x-organization-id']),userId:uuid(h['x-user-id']),membershipId:uuid(h['x-membership-id']),requestId:randomUUID()};}
function query(q:Record<string,unknown>,keys:string[]){if(Object.keys(q).some(k=>!keys.includes(k)))invalid();}
@Controller('v1/guest-identity/email/services')
export class GuestServiceOrderController{
 constructor(private readonly service:ServiceOrderService){}
 @Get('catalog') @Header('Cache-Control','no-store') catalog(@Headers() h:Record<string,string>,@Query() q:Record<string,unknown>){query(q,['reservationId','cursor']);return this.service.catalog(bearer(h),q.reservationId,q.cursor);}
 @Get('orders') @Header('Cache-Control','no-store') list(@Headers() h:Record<string,string>,@Query() q:Record<string,unknown>){query(q,['reservationId','cursor']);return this.service.orders(bearer(h),q.reservationId,q.cursor);}
 @Get('orders/:id/repeat') @Header('Cache-Control','no-store') repeat(@Headers() h:Record<string,string>,@Param('id') id:string,@Query() q:Record<string,unknown>){query(q,[]);return this.service.repeat(bearer(h),id);}
 @Post('orders/:id/feedback') @HttpCode(200) @Header('Cache-Control','no-store') feedback(@Headers() h:Record<string,string>,@Param('id') id:string,@Query() q:Record<string,unknown>,@Body() b:unknown){query(q,[]);return this.service.feedback(bearer(h),id,h['idempotency-key'],b);}
 @Post('orders') @HttpCode(200) @Header('Cache-Control','no-store') request(@Headers() h:Record<string,string>,@Query() q:Record<string,unknown>,@Body() b:unknown){query(q,[]);return this.service.request(bearer(h),h['idempotency-key'],b);}
 @Post('orders/:id/actions') @HttpCode(200) @Header('Cache-Control','no-store') change(@Headers() h:Record<string,string>,@Param('id') id:string,@Query() q:Record<string,unknown>,@Body() b:unknown){query(q,[]);return this.service.change(bearer(h),id,h['idempotency-key'],b);}
}
@Controller('v1/service-orders')
export class StaffServiceOrderController{
 constructor(private readonly service:ServiceOrderService){}
 @Get('assignees') @Header('Cache-Control','no-store') assignees(@Headers() h:Record<string,string>,@Query() q:Record<string,unknown>){query(q,['propertyId']);return this.service.assignees(actor(h),h['x-views-staff-session'],q.propertyId);}
 @Get() @Header('Cache-Control','no-store') queue(@Headers() h:Record<string,string>,@Query() q:Record<string,unknown>){query(q,['propertyId','cursor']);return this.service.queue(actor(h),h['x-views-staff-session'],q.propertyId,q.cursor);}
 @Post(':id/actions') @HttpCode(200) @Header('Cache-Control','no-store') act(@Headers() h:Record<string,string>,@Param('id') id:string,@Query() q:Record<string,unknown>,@Body() b:unknown){query(q,[]);return this.service.act(actor(h),h['x-views-staff-session'],id,h['idempotency-key'],b);}
}
