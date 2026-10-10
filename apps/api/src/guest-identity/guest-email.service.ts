import {BadRequestException,HttpException,Injectable,NotFoundException,ServiceUnavailableException,UnauthorizedException} from '@nestjs/common';
import {createHash,createHmac,randomBytes,randomUUID} from 'node:crypto';
import {DatabaseService} from '../database/database.service';
import {SecurityRateLimitService} from '../security/rate-limit.service';
import {GuestEmailRegistry} from './guest-email.registry';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
export function normalizeGuestEmail(value:unknown){
 if(typeof value!=='string'||value.length>254)throw new BadRequestException('INVALID_GUEST_EMAIL');
 const email=value.trim().toLowerCase(),parts=email.split('@');
 if(parts.length!==2||parts[0].length>64||! /^[a-z0-9!#$%&'*+/=?^_`{|}~.-]+$/.test(parts[0])||
  parts[0].startsWith('.')||parts[0].endsWith('.')||parts[0].includes('..')||
  !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(parts[1]))
  throw new BadRequestException('INVALID_GUEST_EMAIL');
 return email;
}
@Injectable()
export class GuestEmailService{
 constructor(private readonly db:DatabaseService,private readonly mail:GuestEmailRegistry,private readonly limits:SecurityRateLimitService){}
 private enabled(){
  if(process.env.NODE_ENV!=='test'||process.env.VIEWS_LOCAL_REHEARSAL!=='true'||process.env.VIEWS_GUEST_EMAIL_PILOT_ENABLED!=='true')throw new NotFoundException('GUEST_EMAIL_DISABLED');
  const key=process.env.VIEWS_GUEST_EMAIL_TOKEN_KEY;
  if(!key||!/^[a-f0-9]{64}$/.test(key))throw new ServiceUnavailableException('GUEST_EMAIL_KEY_REQUIRED');
  return key;
 }
 private digest(key:string,id:string,token:string){return createHmac('sha256',Buffer.from(key,'hex')).update('guest-email:v1:'+id+':'+token).digest('hex');}
 private network(key:string){if(!/^[a-f0-9]{64}$/.test(key))throw new BadRequestException('INVALID_NETWORK_IDENTITY');return key;}
 async requestLink(address:unknown,locale:unknown,networkKey:string){
  const key=this.enabled(),delivery=this.mail.delivery(),email=normalizeGuestEmail(address);
  if(!['ru','uz','en'].includes(String(locale)))throw new BadRequestException('INVALID_GUEST_LOCALE');
  await this.limits.consume('guest_identity.email.network',this.network(networkKey),20,3600);
  await this.limits.consume('guest_identity.email.address',createHmac('sha256',Buffer.from(key,'hex')).update('email:'+email).digest('hex'),5,3600);
  const challengeId=randomUUID(),token='vgel_'+randomBytes(32).toString('base64url');
  const issued=(await this.db.query<{issued:boolean}>('SELECT app.issue_guest_email_challenge($1,$2,$3,$4) issued',
   [challengeId,email,this.digest(key,challengeId,token),locale])).rows[0]?.issued;
  if(!issued)throw new HttpException('EMAIL_RESEND_COOLDOWN',429);
  try{
   const result=await delivery.send({email,token,challengeId,locale:locale as 'ru'|'uz'|'en',expiresInSeconds:900});
   if(result?.accepted!==true)throw Error('DELIVERY_NOT_ACCEPTED');
  }catch{
   await this.db.query('SELECT app.mark_guest_email_delivery($1,false)',[challengeId]);
   throw new ServiceUnavailableException('GUEST_EMAIL_DELIVERY_UNCERTAIN');
  }
  const marked=(await this.db.query<{ok:boolean}>('SELECT app.mark_guest_email_delivery($1,true) ok',[challengeId])).rows[0]?.ok;
  if(!marked)throw new ServiceUnavailableException('GUEST_EMAIL_CHALLENGE_INACTIVE');
  // Same shape for existing, new and suspended accounts. Never expose the token.
  return {challengeId,expiresInSeconds:900,resendAfterSeconds:60,status:'provider_accepted' as const};
 }
 async exchange(challengeId:unknown,token:unknown,networkKey:string){
  const key=this.enabled();
  await this.limits.consume('guest_identity.email.verify.network',this.network(networkKey),60,300);
  if(typeof challengeId!=='string'||!UUID.test(challengeId)||typeof token!=='string'||!/^vgel_[A-Za-z0-9_-]{43}$/.test(token))throw new UnauthorizedException('GUEST_EMAIL_LINK_INVALID');
  const sessionToken='vges_'+randomBytes(32).toString('base64url');
  // Keep this outside a rollback-on-HTTP-error transaction: failed attempts persist.
  const row=(await this.db.query<{outcome:string;guest_user_id:string;session_expires_at:Date}>(
   'SELECT * FROM app.exchange_guest_email_token($1,$2,$3)',[challengeId,this.digest(key,challengeId,token),hash(sessionToken)])).rows[0];
  if(row?.outcome!=='verified')throw new UnauthorizedException('GUEST_EMAIL_LINK_INVALID');
  return {token:sessionToken,userId:row.guest_user_id,expiresAt:row.session_expires_at.toISOString(),role:'guest' as const};
 }
 async session(token:unknown){
  this.enabled();
  const row=(await this.db.query<{guest_user_id:string;guest_email:string;guest_locale:string;session_expires_at:Date}>(
   'SELECT * FROM app.resolve_guest_email_identity($1)',[this.tokenHash(token)])).rows[0];
  if(!row)throw new UnauthorizedException('GUEST_EMAIL_SESSION_INVALID');
  return {userId:row.guest_user_id,email:row.guest_email,locale:row.guest_locale,expiresAt:row.session_expires_at.toISOString(),role:'guest' as const};
 }
 async logout(token:unknown){this.enabled();await this.db.query('SELECT app.revoke_guest_email_identity($1)',[this.tokenHash(token)]);return {ok:true};}
 private tokenHash(token:unknown){if(typeof token!=='string'||!/^vges_[A-Za-z0-9_-]{43}$/.test(token))throw new UnauthorizedException('GUEST_EMAIL_SESSION_INVALID');return hash(token);}
}
