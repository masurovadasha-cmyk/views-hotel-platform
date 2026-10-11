import {Body,Controller,Get,Header,Headers,HttpCode,Param,Post,Query,UnauthorizedException} from '@nestjs/common';
import {randomUUID} from 'node:crypto';
import {requireUuid} from '../identity/actor-context';
import {invalid} from './supply.input';
import {SupplyService} from './supply.service';
import {SupplyReadService} from './supply-read.service';
function actor(h:Record<string,string>){try{return {organizationId:requireUuid(h['x-organization-id'],'organization_id'),userId:requireUuid(h['x-user-id'],'user_id'),membershipId:requireUuid(h['x-membership-id'],'membership_id'),requestId:randomUUID()};}catch{throw new UnauthorizedException('ACTOR_REQUIRED');}}
function query(q:Record<string,unknown>,allowed:string[]){if(Object.keys(q).some(k=>!allowed.includes(k)))invalid();}
@Controller('v1/supply')
export class SupplyController{
 constructor(private readonly write:SupplyService,private readonly read:SupplyReadService){}
 @Get('properties') @Header('Cache-Control','no-store') properties(@Headers() h:Record<string,string>,@Query() q:Record<string,unknown>){query(q,['cursor']);return this.read.properties(actor(h),q.cursor);}
 @Get(':kind') @Header('Cache-Control','no-store') list(@Headers() h:Record<string,string>,@Param('kind') kind:string,@Query() q:Record<string,unknown>){query(q,['propertyId','cursor']);if(!['items','orders','stock','movements'].includes(kind))invalid();return this.read.list(actor(h),kind as 'items'|'orders'|'stock'|'movements',q.propertyId,q.cursor);}
 @Post('items') @HttpCode(200) @Header('Cache-Control','no-store') item(@Headers() h:Record<string,string>,@Body() b:unknown,@Query() q:Record<string,unknown>){query(q,[]);return this.write.createItem(actor(h),h['idempotency-key'],b);}
 @Post('orders') @HttpCode(200) @Header('Cache-Control','no-store') order(@Headers() h:Record<string,string>,@Body() b:unknown,@Query() q:Record<string,unknown>){query(q,[]);return this.write.createOrder(actor(h),h['idempotency-key'],b);}
 @Post('orders/:id/receive') @HttpCode(200) @Header('Cache-Control','no-store') receive(@Headers() h:Record<string,string>,@Param('id') id:string,@Body() b:unknown,@Query() q:Record<string,unknown>){query(q,[]);return this.write.receive(actor(h),id,h['idempotency-key'],b);}
 @Post('stock/issue') @HttpCode(200) @Header('Cache-Control','no-store') issue(@Headers() h:Record<string,string>,@Body() b:unknown,@Query() q:Record<string,unknown>){query(q,[]);return this.write.issue(actor(h),h['idempotency-key'],b);}
}
