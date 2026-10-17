import {BadRequestException,Body,Controller,Header,Headers,HttpCode,Param,Post,Query,UnauthorizedException} from '@nestjs/common';
import {GuestCancellationService} from './guest-cancellation.service';
function bearer(value:unknown){if(typeof value!=='string'||!value.startsWith('Bearer '))throw new UnauthorizedException('GUEST_EMAIL_SESSION_INVALID');return value.slice(7);}
function exact(raw:unknown,keys:string[],query:Record<string,unknown>){if(Object.keys(query).length||!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).length!==keys.length||!keys.every(k=>Object.hasOwn(raw,k)))throw new BadRequestException('GUEST_CANCELLATION_INPUT_INVALID');return raw as Record<string,unknown>;}
@Controller('v1/guest-identity/email/trips/:id/cancellation')
export class GuestCancellationController{
 constructor(private readonly cancellation:GuestCancellationService){}
 @Post('preview') @HttpCode(200) @Header('Cache-Control','no-store')
 preview(@Headers('authorization') token:unknown,@Param('id') id:string,@Body() raw:unknown,@Query() query:Record<string,unknown>){exact(raw,[],query);return this.cancellation.preview(bearer(token),id);}
 @Post('confirm') @HttpCode(200) @Header('Cache-Control','no-store')
 confirm(@Headers('authorization') token:unknown,@Headers('idempotency-key') key:unknown,@Param('id') id:string,@Body() raw:unknown,@Query() query:Record<string,unknown>){const b=exact(raw,['quoteId'],query);return this.cancellation.confirm(bearer(token),id,b.quoteId,key);}
}
