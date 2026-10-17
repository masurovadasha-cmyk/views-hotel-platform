import {Body,Controller,Get,Header,Headers,HttpCode,Param,Post,Query,UnauthorizedException} from '@nestjs/common';
import {randomUUID} from 'node:crypto';
import {requireUuid} from '../identity/actor-context';
import {FolioService} from './folio.service';
import {NightAuditService} from './night-audit.service';
import {invalid} from './folio.input';
function actor(h:Record<string,string>){try{return {organizationId:requireUuid(h['x-organization-id'],'organization_id'),userId:requireUuid(h['x-user-id'],'user_id'),membershipId:requireUuid(h['x-membership-id'],'membership_id'),requestId:randomUUID()};}catch{throw new UnauthorizedException('ACTOR_REQUIRED');}}
function query(raw:Record<string,unknown>,allowed:string[]){if(Object.keys(raw).some(k=>!allowed.includes(k)))invalid();return raw;}
@Controller('v1/folios')
export class FolioController{
 constructor(private readonly folios:FolioService){}
 @Get('properties') @Header('Cache-Control','no-store') properties(@Headers() h:Record<string,string>,@Query() q:Record<string,unknown>){query(q,['cursor']);return this.folios.properties(actor(h),q.cursor);}
 @Get() @Header('Cache-Control','no-store') list(@Headers() h:Record<string,string>,@Query() q:Record<string,unknown>){query(q,['propertyId','cursor']);return this.folios.list(actor(h),q.propertyId,q.cursor);}
 @Get('reservations/:id') @Header('Cache-Control','no-store') detail(@Headers() h:Record<string,string>,@Param('id') target:string,@Query() q:Record<string,unknown>){query(q,['cursor']);return this.folios.detail(actor(h),target,q.cursor);}
 @Post('reservations/:id/charges') @HttpCode(200) @Header('Cache-Control','no-store') charge(@Headers() h:Record<string,string>,@Param('id') target:string,@Body() raw:unknown,@Query() q:Record<string,unknown>){query(q,[]);return this.folios.charge(actor(h),target,h['idempotency-key'],raw);}
 @Post('reservations/:id/reversals') @HttpCode(200) @Header('Cache-Control','no-store') reverse(@Headers() h:Record<string,string>,@Param('id') target:string,@Body() raw:unknown,@Query() q:Record<string,unknown>){query(q,[]);return this.folios.reverse(actor(h),target,h['idempotency-key'],raw);}
}
@Controller('v1/night-audit')
export class NightAuditController{
 constructor(private readonly audit:NightAuditService){}
 @Get() @Header('Cache-Control','no-store') inspect(@Headers() h:Record<string,string>,@Query() q:Record<string,unknown>){query(q,['propertyId','businessDate']);return this.audit.inspect(actor(h),q.propertyId,q.businessDate);}
 @Post() @HttpCode(200) @Header('Cache-Control','no-store') run(@Headers() h:Record<string,string>,@Body() raw:unknown,@Query() q:Record<string,unknown>){query(q,[]);return this.audit.run(actor(h),h['idempotency-key'],raw);}
}
