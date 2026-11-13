import {BadRequestException,Body,Controller,Get,Header,Headers,Param,Post,Query,UnauthorizedException} from '@nestjs/common';
import {GuestQuoteService} from './guest-quote.service';
@Controller('v1')
export class GuestQuoteController{
 constructor(private readonly offers:GuestQuoteService){}
 @Post('quotes/:id/guest-offer') @Header('Cache-Control','no-store')
 issue(@Headers('x-views-staff-session') token:unknown,@Param('id') id:string,@Body() body:unknown){
  if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).join()!=='guestProfileId')throw new BadRequestException('GUEST_QUOTE_INPUT_INVALID');
  return this.offers.issue(token,id,(body as {guestProfileId:unknown}).guestProfileId);
 }
 @Get('guest-identity/sms/quotes/:id') @Header('Cache-Control','no-store')
 read(@Headers('authorization') token:unknown,@Param('id') id:string,@Query() query:Record<string,unknown>){
  if(Object.keys(query).length)throw new BadRequestException('GUEST_QUOTE_INPUT_INVALID');
  if(typeof token!=='string'||!token.startsWith('Bearer '))throw new UnauthorizedException('GUEST_SESSION_INVALID');
  return this.offers.read(token.slice(7),id);
 }
}
