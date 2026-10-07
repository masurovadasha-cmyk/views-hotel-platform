import {Body,Controller,Get,Headers,Post,UnauthorizedException,Header} from '@nestjs/common';
import type {IncomingHttpHeaders} from 'node:http';
import {randomUUID} from 'node:crypto';
import {requireUuid} from '../identity/actor-context';
import {OwnerInventoryService} from './owner-inventory.service';
function actor(h:IncomingHttpHeaders){
 try{return {organizationId:requireUuid(single(h['x-organization-id']),'organization_id'),userId:requireUuid(single(h['x-user-id']),'user_id'),membershipId:requireUuid(single(h['x-membership-id']),'membership_id'),requestId:randomUUID()};}
 catch{throw new UnauthorizedException('ACTOR_REQUIRED');}
}
function single(v:string|string[]|undefined){return typeof v==='string'?v:undefined;}
@Controller('v1/owner-inventory')
export class OwnerInventoryController{
 constructor(private readonly inventory:OwnerInventoryService){}
 @Get() @Header('Cache-Control','no-store')
 list(@Headers() h:IncomingHttpHeaders){return this.inventory.list(actor(h));}
 @Post() @Header('Cache-Control','no-store')
 create(@Headers() h:IncomingHttpHeaders,@Body() body:unknown){return this.inventory.create(actor(h),body,single(h['idempotency-key'])||'');}
}
