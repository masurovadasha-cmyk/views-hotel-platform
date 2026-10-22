import {BadRequestException,HttpException,Injectable,NotFoundException,ServiceUnavailableException,UnauthorizedException} from '@nestjs/common';
import {createHash,createHmac,randomBytes,randomInt,randomUUID} from 'node:crypto';
import {DatabaseService} from '../database/database.service';
import {SecurityRateLimitService} from '../security/rate-limit.service';
import {GuestSmsRegistry} from './guest-sms.registry';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
@Injectable()
export class GuestIdentityService{
 constructor(private readonly db:DatabaseService,private readonly sms:GuestSmsRegistry,private readonly limits:SecurityRateLimitService){}
 private enabled(){
  if(process.env.NODE_ENV!=='test'||process.env.VIEWS_LOCAL_REHEARSAL!=='true'||process.env.VIEWS_GUEST_SMS_PILOT_ENABLED!=='true')throw new NotFoundException('GUEST_IDENTITY_DISABLED');
  const secret=process.env.VIEWS_GUEST_SMS_OTP_KEY;
  if(!secret||! /^[a-f0-9]{64}$/.test(secret))throw new ServiceUnavailableException('GUEST_SMS_KEY_REQUIRED');
  return secret;
 }
 private digest(secret:string,id:string,code:string){return createHmac('sha256',Buffer.from(secret,'hex')).update('guest-sms:'+id+':'+code).digest('hex');}
 private network(key:string){if(!/^[a-f0-9]{64}$/.test(key))throw new BadRequestException('INVALID_NETWORK_IDENTITY');return key;}
 async requestCode(phone:unknown,locale:unknown,networkKey:string){
  const secret=this.enabled(),delivery=this.sms.delivery();
  if(typeof phone!=='string'||!/^\+[1-9][0-9]{7,14}$/.test(phone)||!['ru','uz','en'].includes(String(locale)))throw new BadRequestException('INVALID_GUEST_IDENTITY');
  await this.limits.consume('guest_identity.sms.network',this.network(networkKey),20,3600);
  const phoneKey=createHmac('sha256',Buffer.from(secret,'hex')).update('phone:'+phone).digest('hex');
  await this.limits.consume('guest_identity.sms.phone',phoneKey,5,3600);
  const challengeId=randomUUID(),code=String(randomInt(0,1000000)).padStart(6,'0');
  const issued=(await this.db.query<{issued:boolean}>('SELECT app.issue_guest_sms_challenge($1,$2,$3,$4) issued',[challengeId,phone,this.digest(secret,challengeId,code),locale])).rows[0]?.issued;
  if(!issued)throw new HttpException('SMS_RESEND_COOLDOWN',429);
  try{
   await delivery.send({phone,code,locale:locale as 'ru'|'uz'|'en',expiresInSeconds:300,idempotencyKey:challengeId});
   await this.db.query('SELECT app.mark_guest_sms_delivery($1,true)',[challengeId]);
  }catch{
   await this.db.query('SELECT app.mark_guest_sms_delivery($1,false)',[challengeId]);
   throw new ServiceUnavailableException('GUEST_SMS_DELIVERY_UNCERTAIN');
  }
  return {challengeId,expiresInSeconds:300,resendAfterSeconds:60};
 }
 async verifyCode(challengeId:unknown,code:unknown,networkKey:string){
  const secret=this.enabled();
  await this.limits.consume('guest_identity.verify.network',this.network(networkKey),60,300);
  if(typeof challengeId!=='string'||!UUID.test(challengeId)||typeof code!=='string'||!/^\d{6}$/.test(code))throw new UnauthorizedException('GUEST_CODE_INVALID');
  const token='vgs_'+randomBytes(32).toString('base64url');
  // One committed SQL function call: failed attempts must survive an HTTP error.
  const row=(await this.db.query<{outcome:string;guest_user_id:string;session_expires_at:Date}>(
   'SELECT * FROM app.exchange_guest_sms_code($1,$2,$3)',[challengeId,this.digest(secret,challengeId,code),hash(token)])).rows[0];
  if(row?.outcome!=='verified')throw new UnauthorizedException('GUEST_CODE_INVALID');
  return {token,userId:row.guest_user_id,expiresAt:row.session_expires_at.toISOString(),role:'guest' as const};
 }
 async session(token:unknown){
  this.enabled();const digest=this.tokenHash(token);
  const row=(await this.db.query<{guest_user_id:string;guest_locale:string;session_expires_at:Date}>('SELECT * FROM app.resolve_guest_identity($1)',[digest])).rows[0];
  if(!row)throw new UnauthorizedException('GUEST_SESSION_INVALID');
  return {userId:row.guest_user_id,locale:row.guest_locale,expiresAt:row.session_expires_at.toISOString(),role:'guest' as const};
 }
 async logout(token:unknown){this.enabled();await this.db.query('SELECT app.revoke_guest_identity($1)',[this.tokenHash(token)]);return {ok:true};}
 private tokenHash(token:unknown){if(typeof token!=='string'||!/^vgs_[A-Za-z0-9_-]{43}$/.test(token))throw new UnauthorizedException('GUEST_SESSION_INVALID');return hash(token);}
}
