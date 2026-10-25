import {PartnerBoundaryGuard} from './partner-boundary.guard';
import {Body,Controller,Get,Post,Header,Headers,HttpCode,Param,Query,UnauthorizedException,UseGuards} from '@nestjs/common';
import {randomUUID} from 'node:crypto';
import {id,query} from './partner.input';
import {PartnerService} from './partner.service';
type HeadersMap=Record<string,string|undefined>;
function actor(h:HeadersMap){return {organizationId:id(h['x-organization-id']),userId:id(h['x-user-id']),membershipId:id(h['x-membership-id']),requestId:randomUUID()};}
function partner(h:HeadersMap){if(['x-organization-id','x-user-id','x-membership-id','x-views-staff-session','authorization'].some(k=>h[k]!==undefined))throw new UnauthorizedException('PARTNER_SESSION_REQUIRED');return h['x-views-partner-session'];}
@Controller('v1/partner-dispatch')
export class PartnerDispatchController{
 constructor(private readonly service:PartnerService){}
 @Get() @Header('Cache-Control','no-store') list(@Headers() h:HeadersMap,@Query() q:Record<string,unknown>){return this.service.dispatch(actor(h),h['x-views-staff-session'],q);}
 @Post('offers') @HttpCode(200) @Header('Cache-Control','no-store') offer(@Headers() h:HeadersMap,@Query() q:Record<string,unknown>,@Headers('idempotency-key') key:string,@Body() body:unknown){query(q,[]);return this.service.offer(actor(h),h['x-views-staff-session'],key,body);}
}
@UseGuards(PartnerBoundaryGuard)
@Controller('v1/partner-assignments')
export class PartnerAssignmentsController{
 constructor(private readonly service:PartnerService){}
 @Get('session') @Header('Cache-Control','no-store') session(@Headers() h:HeadersMap,@Query() q:Record<string,unknown>){query(q,[]);return this.service.session(partner(h));}
 @Get() @Header('Cache-Control','no-store') list(@Headers() h:HeadersMap,@Query() q:Record<string,unknown>){return this.service.list(partner(h),q);}
 @Post(':id/decisions') @HttpCode(200) @Header('Cache-Control','no-store') decide(@Headers() h:HeadersMap,@Param('id') assignment:string,@Query() q:Record<string,unknown>,@Headers('idempotency-key') key:string,@Body() body:unknown){query(q,[]);return this.service.decide(partner(h),assignment,key,body);}
}
