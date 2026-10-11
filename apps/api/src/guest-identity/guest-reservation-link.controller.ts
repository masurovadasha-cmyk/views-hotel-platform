import {BadRequestException,Body,Controller,Get,Header,Headers,HttpCode,Param,Post,UnauthorizedException} from '@nestjs/common';
import {GuestReservationLinkService} from './guest-reservation-link.service';
function exact(raw:unknown,keys:string[]){if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).length!==keys.length||!keys.every(k=>Object.hasOwn(raw,k)))throw new BadRequestException('GUEST_LINK_INPUT_INVALID');return raw as Record<string,unknown>;}
function bearer(raw:unknown){if(typeof raw!=='string'||!raw.startsWith('Bearer '))throw new UnauthorizedException('GUEST_EMAIL_SESSION_INVALID');return raw.slice(7);}
@Controller('v1/bookings/:id/guest-link')
export class StaffGuestLinkController{
 constructor(private readonly links:GuestReservationLinkService){}
 @Get() @Header('Cache-Control','no-store')
 inspect(@Headers('x-views-staff-session') session:unknown,@Param('id') id:string){return this.links.inspect(session,id);}
 @Post() @HttpCode(200) @Header('Cache-Control','no-store')
 issue(@Headers('x-views-staff-session') session:unknown,@Headers('idempotency-key') key:unknown,@Param('id') id:string,@Body() raw:unknown){const b=exact(raw,['email']);return this.links.issue(session,id,b.email,key);}
 @Post('revoke') @HttpCode(200) @Header('Cache-Control','no-store')
 revoke(@Headers('x-views-staff-session') session:unknown,@Param('id') id:string,@Body() raw:unknown){return this.links.revoke(session,id,exact(raw,['linkId']).linkId);}
}
@Controller('v1/guest-identity/email/reservation-link')
export class GuestReservationLinkController{
 constructor(private readonly links:GuestReservationLinkService){}
 @Post('preview') @HttpCode(200) @Header('Cache-Control','no-store')
 preview(@Headers('authorization') session:unknown,@Body() raw:unknown){return this.links.use(bearer(session),exact(raw,['token']).token,false);}
 @Post('accept') @HttpCode(200) @Header('Cache-Control','no-store')
 accept(@Headers('authorization') session:unknown,@Body() raw:unknown){return this.links.use(bearer(session),exact(raw,['token']).token,true);}
}
