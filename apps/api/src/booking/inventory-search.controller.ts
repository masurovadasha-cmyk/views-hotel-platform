import {Controller,Get,Header,Headers,Query,UnauthorizedException} from '@nestjs/common';
import {randomUUID} from 'node:crypto';
import {requireUuid} from '../identity/actor-context';
import {InventorySearchService} from './inventory-search.service';
@Controller('v1/inventory-search')
export class InventorySearchController{
 constructor(private readonly catalog:InventorySearchService){}
 @Get() @Header('Cache-Control','no-store')
 search(@Headers('x-organization-id') org:string,@Headers('x-user-id') user:string,@Headers('x-membership-id') member:string,
  @Query('from') from:unknown,@Query('to') to:unknown,@Query('guests') guests:unknown,@Query('city') city:unknown,@Query('cursor') cursor:unknown){
  let actor;try{actor={organizationId:requireUuid(org,'organization_id'),userId:requireUuid(user,'user_id'),membershipId:requireUuid(member,'membership_id'),requestId:randomUUID()};}
  catch{throw new UnauthorizedException('ACTOR_REQUIRED');}
  return this.catalog.search(actor,{from,to,guests,city,cursor});
 }
}
