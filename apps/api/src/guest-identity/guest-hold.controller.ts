import {BadRequestException,Body,Controller,Header,Headers,Post,UnauthorizedException} from '@nestjs/common';
import {GuestHoldService} from './guest-hold.service';
@Controller('v1/guest-identity/sms/holds')
export class GuestHoldController{
 constructor(private readonly holds:GuestHoldService){}
 @Post() @Header('Cache-Control','no-store')
 create(@Headers('authorization') authorization:unknown,@Headers('idempotency-key') key:unknown,@Body() body:unknown){
  if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).join()!=='quoteId')throw new BadRequestException('GUEST_HOLD_INPUT_INVALID');
  if(typeof authorization!=='string'||!authorization.startsWith('Bearer '))throw new UnauthorizedException('GUEST_SESSION_INVALID');
  return this.holds.create(authorization.slice(7),(body as {quoteId:unknown}).quoteId,key);
 }
}
