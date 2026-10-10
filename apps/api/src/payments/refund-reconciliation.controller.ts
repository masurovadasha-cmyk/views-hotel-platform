import {Body,Controller,Get,Header,Headers,Param,Post,Query,UnauthorizedException} from '@nestjs/common';
import {randomUUID} from 'node:crypto';
import {requireUuid} from '../identity/actor-context';
import {RefundReconciliationService} from './refund-reconciliation.service';

function actor(headers:Record<string,string>){
 try{return {organizationId:requireUuid(headers['x-organization-id'],'organization_id'),
  userId:requireUuid(headers['x-user-id'],'user_id'),membershipId:requireUuid(headers['x-membership-id'],'membership_id'),requestId:randomUUID()};}
 catch{throw new UnauthorizedException('ACTOR_REQUIRED');}
}
/** Internal authenticated staff transport only; no money execution endpoint. */
@Controller('v1/refund-reconciliation')
export class RefundReconciliationController{
 constructor(private readonly refunds:RefundReconciliationService){}
 @Get() @Header('Cache-Control','no-store')
 list(@Headers() headers:Record<string,string>,@Query('propertyId') propertyId:unknown,@Query('status') status:unknown,@Query('cursor') cursor:unknown){
  return this.refunds.list(actor(headers),{propertyId,status,cursor});
 }
 @Get(':id') @Header('Cache-Control','no-store')
 detail(@Headers() headers:Record<string,string>,@Param('id') id:string){return this.refunds.detail(actor(headers),id);}
 @Post(':id/reviews') @Header('Cache-Control','no-store')
 review(@Headers() headers:Record<string,string>,@Param('id') id:string,@Body() body:unknown){
  return this.refunds.review(actor(headers),id,headers['idempotency-key'],body);
 }
}
