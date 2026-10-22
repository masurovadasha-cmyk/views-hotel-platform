import {BadRequestException,Body,Controller,Get,Headers,Header,HttpCode,Post,Query,UnauthorizedException} from '@nestjs/common';
import type {IncomingHttpHeaders} from 'node:http';
import {randomUUID} from 'node:crypto';
import {requireUuid} from '../identity/actor-context';
import {HousekeepingService,type CleaningAction} from './housekeeping.service';
function context(h:IncomingHttpHeaders){
 if(h['x-views-service-id']!=='local-workspace')throw new UnauthorizedException('STAFF_GATEWAY_REQUIRED');
 const single=(k:string)=>typeof h[k]==='string'?h[k] as string:undefined;
 try{return {actor:{organizationId:requireUuid(single('x-organization-id'),'organization_id'),userId:requireUuid(single('x-user-id'),'user_id'),membershipId:requireUuid(single('x-membership-id'),'membership_id'),requestId:randomUUID()},token:single('x-views-staff-session')||''};}
 catch{throw new BadRequestException('INVALID_HOUSEKEEPING_REQUEST');}
}
@Controller('v1/housekeeping')
export class HousekeepingController{
 constructor(private readonly tasks:HousekeepingService){}
 @Get() @Header('Cache-Control','no-store')
 list(@Headers() h:IncomingHttpHeaders,@Query('propertyId') propertyId:string){
  const c=context(h);try{requireUuid(propertyId,'property_id');}catch{throw new BadRequestException('INVALID_HOUSEKEEPING_REQUEST');}
  return this.tasks.list(c.actor,c.token,propertyId);
 }
 @Post() @HttpCode(200) @Header('Cache-Control','no-store')
 act(@Headers() h:IncomingHttpHeaders,@Body() body:{propertyId:string;taskId:string;action:CleaningAction}){
  const c=context(h);let key:string;
  try{
   if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).sort().join(',')!=='action,propertyId,taskId')throw Error();
   requireUuid(body.propertyId,'property_id');requireUuid(body.taskId,'task_id');key=requireUuid(typeof h['idempotency-key']==='string'?h['idempotency-key']:undefined,'key');
  }catch{throw new BadRequestException('INVALID_HOUSEKEEPING_REQUEST');}
  return this.tasks.act(c.actor,c.token,body.propertyId,body.taskId,body.action,key);
 }
}
