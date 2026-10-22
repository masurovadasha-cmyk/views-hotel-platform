import {BadRequestException,ConflictException,ForbiddenException,HttpException,Injectable,NotFoundException,ServiceUnavailableException,UnauthorizedException} from '@nestjs/common';
import {createHash,createHmac} from 'node:crypto';
import {DatabaseService} from '../database/database.service';
import {StaffAuthService} from '../staff-auth/staff-auth.service';
import {GuestEmailService,normalizeGuestEmail} from './guest-email.service';
import {SecurityRateLimitService,RateLimitExceededError} from '../security/rate-limit.service';
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
const uuid=(s:unknown)=>{if(typeof s!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(s))throw new BadRequestException('GUEST_LINK_INPUT_INVALID');return s;};
export type LinkPreview={reservationId:string;confirmationCode:string;propertyName:Record<string,string>;checkInAt:string;checkOutAt:string;timezone:string;accepted:boolean};
@Injectable()
export class GuestReservationLinkService{
 constructor(private readonly db:DatabaseService,private readonly staff:StaffAuthService,private readonly guest:GuestEmailService,private readonly limits:SecurityRateLimitService){}
 private enabled(){if(process.env.NODE_ENV!=='test'||process.env.VIEWS_LOCAL_REHEARSAL!=='true'||process.env.VIEWS_GUEST_LINK_PILOT_ENABLED!=='true')throw new NotFoundException('GUEST_LINK_DISABLED');}
 private async query<T>(sql:string,params:unknown[]):Promise<T>{try{return (await this.db.query<{result:T}>(sql,params)).rows[0].result;}catch(e){
  const error=e as {code?:string;message?:string};
  if(error.code==='28000')throw new UnauthorizedException('GUEST_EMAIL_SESSION_INVALID');
  if(error.code==='42501')throw new ForbiddenException('GUEST_LINK_STAFF_DENIED');
  if(error.code==='23505')throw new ConflictException('GUEST_LINK_COMMAND_CONFLICT');
  if(error.code==='22023')throw new BadRequestException(error.message?.startsWith('GUEST_LINK_')?error.message:'GUEST_LINK_INVALID');throw e;
 }}
 async issue(token:unknown,id:unknown,address:unknown,key:unknown){
  this.enabled();const identity=await this.staff.resolve(token),target=uuid(id),command=uuid(key),email=normalizeGuestEmail(address);
  const secret=process.env.VIEWS_GUEST_LINK_TOKEN_KEY;if(!secret||!/^[a-f0-9]{64}$/.test(secret))throw new ServiceUnavailableException('GUEST_LINK_KEY_REQUIRED');
  const code='vglk_'+createHmac('sha256',Buffer.from(secret,'hex')).update(JSON.stringify(['reservation-link:v1',identity.organizationId,target,email,command])).digest('base64url');
  const result=await this.query<{linkId:string;reservationId:string;expiresAt:string;replayed:boolean}>('SELECT app.issue_guest_reservation_link($1,$2,$3,$4,$5) result',[hash(token as string),target,email,hash(code),command]);
  return {...result,token:code,delivery:'manual_handoff' as const};
 }
 async inspect(token:unknown,id:unknown){this.enabled();await this.staff.resolve(token);return this.query('SELECT app.inspect_guest_reservation_link($1,$2) result',[hash(token as string),uuid(id)]);}
 async revoke(token:unknown,id:unknown,linkId:unknown){this.enabled();await this.staff.resolve(token);await this.query('SELECT app.revoke_guest_reservation_link($1,$2,$3) result',[hash(token as string),uuid(id),uuid(linkId)]);return {ok:true};}
 async use(token:string,code:unknown,accept:boolean){
  this.enabled();const identity=await this.guest.session(token);
  try{await this.limits.consume('guest.link.account',hash(identity.userId),30,300);}catch(e){if(e instanceof RateLimitExceededError)throw new HttpException({message:'RATE_LIMITED',retryAfterSeconds:e.retryAfterSeconds},429);throw e;}
  if(typeof code!=='string'||!/^vglk_[A-Za-z0-9_-]{43}$/.test(code))throw new BadRequestException('GUEST_LINK_INVALID');
  return this.query<LinkPreview>('SELECT app.use_guest_reservation_link($1,$2,$3) result',[hash(token),hash(code),accept]);
 }
}
