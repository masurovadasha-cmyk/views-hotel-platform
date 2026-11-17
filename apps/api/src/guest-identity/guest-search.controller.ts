import {BadRequestException,Controller,Get,Header,Headers,NotFoundException,Query} from '@nestjs/common';
import {createHash} from 'node:crypto';
import {DatabaseService} from '../database/database.service';
import {calendarWindow} from '../owner/owner-calendar.input';
import {GuestIdentityService} from './guest-identity.service';
@Controller('v1/guest-identity/sms/search')
export class GuestSearchController{
 constructor(private readonly db:DatabaseService,private readonly auth:GuestIdentityService){}
 @Get() @Header('Cache-Control','no-store')
 async search(@Headers('authorization') authorization:string|undefined,@Query() q:Record<string,unknown>){
  if(process.env.NODE_ENV!=='test'||process.env.VIEWS_LOCAL_REHEARSAL!=='true'||process.env.VIEWS_GUEST_QUOTES_PILOT_ENABLED!=='true')throw new NotFoundException('GUEST_SEARCH_DISABLED');
  const token=authorization?.startsWith('Bearer ')?authorization.slice(7):undefined;
  await this.auth.session(token);
  if(Object.keys(q).some(k=>!['from','to','guests','city'].includes(k)))throw new BadRequestException('GUEST_SEARCH_INPUT_INVALID');
  calendarWindow(q.from,q.to);
  if(typeof q.guests!=='string'||!/^([1-9]|1[0-9]|20)$/.test(q.guests)||typeof q.city!=='string'||q.city.length>80)throw new BadRequestException('GUEST_SEARCH_INPUT_INVALID');
  const result=(await this.db.query<{result:{items:unknown[];priceKind:string;requiresQuote:boolean}}>(
   'SELECT app.guest_catalog_search($1,$2,$3,$4,$5) result',[createHash('sha256').update(token!).digest('hex'),q.from,q.to,Number(q.guests),q.city.trim()])).rows[0].result;
  return {...result,items:result.items.slice(0,50),truncated:result.items.length>50};
 }
}
