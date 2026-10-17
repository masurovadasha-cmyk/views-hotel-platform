import {Body,Controller,Header,Headers,HttpCode,Post,Query,UnauthorizedException} from '@nestjs/common';
import {randomUUID} from 'node:crypto';
import {requireUuid} from '../identity/actor-context';
import {invalid} from './supply.input';
import {SupplyStocktakeService} from './supply-stocktake.service';
function actor(h:Record<string,string>){try{return {organizationId:requireUuid(h['x-organization-id'],'organization_id'),userId:requireUuid(h['x-user-id'],'user_id'),membershipId:requireUuid(h['x-membership-id'],'membership_id'),requestId:randomUUID()};}catch{throw new UnauthorizedException('ACTOR_REQUIRED');}}
@Controller('v1/supply/stocktake')
export class SupplyStocktakeController{
 constructor(private readonly stocktake:SupplyStocktakeService){}
 @Post('preview') @HttpCode(200) @Header('Cache-Control','no-store') preview(@Headers() h:Record<string,string>,@Body() raw:unknown,@Query() q:Record<string,unknown>){if(Object.keys(q).length)invalid();return this.stocktake.preview(actor(h),raw);}
 @Post('confirm') @HttpCode(200) @Header('Cache-Control','no-store') confirm(@Headers() h:Record<string,string>,@Body() raw:unknown,@Query() q:Record<string,unknown>){if(Object.keys(q).length)invalid();return this.stocktake.confirm(actor(h),h['idempotency-key'],raw);}
}
