import {BadRequestException,Controller,Get,Header,Headers,Param,Query,UnauthorizedException} from '@nestjs/common';
import {GuestTripsService} from './guest-trips.service';
function bearer(value:unknown){if(typeof value!=='string'||!value.startsWith('Bearer '))throw new UnauthorizedException('GUEST_EMAIL_SESSION_INVALID');return value.slice(7);}
@Controller('v1/guest-identity/email/trips')
export class GuestTripsController{
 constructor(private readonly trips:GuestTripsService){}
 @Get() @Header('Cache-Control','no-store')
 list(@Headers('authorization') token:unknown,@Query() query:Record<string,unknown>){
  if(Object.keys(query).some(k=>k!=='cursor'))throw new BadRequestException('INVALID_GUEST_TRIP_QUERY');
  return this.trips.list(bearer(token),query.cursor);
 }
 @Get(':id') @Header('Cache-Control','no-store')
 detail(@Headers('authorization') token:unknown,@Param('id') id:string,@Query() query:Record<string,unknown>){
  if(Object.keys(query).length)throw new BadRequestException('INVALID_GUEST_TRIP_QUERY');
  return this.trips.detail(bearer(token),id);
 }
}
