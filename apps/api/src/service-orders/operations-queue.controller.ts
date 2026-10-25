import {Controller,Get,Headers,Header,Query} from '@nestjs/common';
import {randomUUID} from 'node:crypto';
import {OperationsQueueService} from './operations-queue.service';
import {uuid} from './service-order.input';
@Controller('v1/service-orders/queue')
export class OperationsQueueController{
 constructor(private readonly service:OperationsQueueService){}
 @Get() @Header('Cache-Control','no-store') list(@Headers() h:Record<string,string>,@Query() q:Record<string,unknown>){
  return this.service.list({organizationId:uuid(h['x-organization-id']),userId:uuid(h['x-user-id']),membershipId:uuid(h['x-membership-id']),requestId:randomUUID()},h['x-views-staff-session'],q);
 }
}
