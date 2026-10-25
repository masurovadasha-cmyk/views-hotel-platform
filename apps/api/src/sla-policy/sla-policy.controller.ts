import {Controller,Get,Post,Body,Headers,Query,Header,BadRequestException} from '@nestjs/common';
import type {IncomingHttpHeaders} from 'node:http';
import {requireUuid} from '../identity/actor-context';
import {randomUUID} from 'node:crypto';
import {SlaPolicyService} from './sla-policy.service';
function only(q:Record<string,unknown>,keys:string[]){if(Object.keys(q).some(k=>!keys.includes(k)))throw new BadRequestException('INVALID_SLA_QUERY');}
const one=(h:IncomingHttpHeaders,k:string)=>typeof h[k]==='string'?h[k] as string:'';
const actor=(h:IncomingHttpHeaders)=>({organizationId:requireUuid(one(h,'x-organization-id'),'organization'),userId:requireUuid(one(h,'x-user-id'),'user'),membershipId:requireUuid(one(h,'x-membership-id'),'membership'),requestId:randomUUID()});
async function safe<T>(work:()=>Promise<T>){try{return await work();}catch(e){if(e instanceof Error&&/^(INVALID_SLA|SLA_LOCAL_TIME|SLA_SIMULATION_HORIZON)/.test(e.message))throw new BadRequestException(e.message);throw e;}}
@Controller('v1/sla-policy')
export class SlaPolicyController{
 constructor(private readonly service:SlaPolicyService){}
 @Get() @Header('Cache-Control','no-store') list(@Headers() h:IncomingHttpHeaders,@Query() q:Record<string,unknown>){only(q,['propertyId']);return safe(()=>this.service.list(actor(h),q.propertyId as string,one(h,'x-views-staff-session')));}
 @Post('drafts') @Header('Cache-Control','no-store') save(@Headers() h:IncomingHttpHeaders,@Body() body:unknown,@Query() q:Record<string,unknown>){only(q,[]);return safe(()=>this.service.save(actor(h),one(h,'x-views-staff-session'),one(h,'idempotency-key'),body));}
 @Post('simulate') @Header('Cache-Control','no-store') preview(@Headers() h:IncomingHttpHeaders,@Body() body:unknown,@Query() q:Record<string,unknown>){only(q,[]);return safe(()=>this.service.preview(actor(h),one(h,'x-views-staff-session'),body));}
}
