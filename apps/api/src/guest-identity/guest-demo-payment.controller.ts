import {BadRequestException,Body,Controller,Header,Headers,Post,UnauthorizedException} from '@nestjs/common';
import {GuestDemoPaymentService} from './guest-demo-payment.service';
@Controller('v1/guest-identity/sms/demo-payment')
export class GuestDemoPaymentController{
 constructor(private readonly payments:GuestDemoPaymentService){}
 @Post() @Header('Cache-Control','no-store')
 pay(@Headers('authorization') token:unknown,@Body() body:unknown){
  if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).join()!=='reservationId')throw new BadRequestException('DEMO_PAYMENT_INPUT_INVALID');
  if(typeof token!=='string'||!token.startsWith('Bearer '))throw new UnauthorizedException('GUEST_SESSION_INVALID');
  return this.payments.pay(token.slice(7),(body as {reservationId:unknown}).reservationId);
 }
}
