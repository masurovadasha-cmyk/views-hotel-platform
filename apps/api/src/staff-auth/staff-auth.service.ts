import {BadRequestException,ForbiddenException,HttpException,Injectable,NotFoundException,UnauthorizedException} from '@nestjs/common';
import {createHash,createHmac,randomBytes} from 'node:crypto';
import {DatabaseService} from '../database/database.service';
import {loadConfig} from '../config';
import {DUMMY_PASSWORD_HASH,hashStaffPassword,StaffPasswordError,verifyStaffPassword} from './staff-password';

export type StaffIdentity={organizationId:string;userId:string;membershipId:string;email:string;displayName:string;
  role:string;permissions:string[];propertyIds:string[];expiresAt:string;credentialVersion:number;emailVerified:boolean};
export const staffTokenHash=(value:string)=>createHash('sha256').update(value).digest('hex');
const TOKEN=/^[a-f0-9]{64}$/;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;

@Injectable()
export class StaffAuthService{
  constructor(private readonly db:DatabaseService){}
  scope(){
    if(process.env.VIEWS_STAFF_AUTH_PILOT_ENABLED!=='true'||process.env.NODE_ENV!=='test'||
       process.env.VIEWS_LOCAL_REHEARSAL!=='true')throw new NotFoundException('STAFF_AUTH_NOT_ACTIVATED');
    const org=process.env.VIEWS_STAFF_AUTH_ORGANIZATION_ID||'';
    if(!UUID.test(org))throw new NotFoundException('STAFF_AUTH_NOT_ACTIVATED');
    return org;
  }
  private async rate(action:string,key:string,limit:number,window=300){
    const hash=createHmac('sha256',loadConfig().guestAuthRateLimitSecret).update(action+':'+this.scope()+':'+key).digest('hex');
    const row=(await this.db.query<{allowed:boolean}>('SELECT * FROM app.consume_security_rate_limit($1,$2,$3,$4)',[action,hash,limit,window])).rows[0];
    if(!row?.allowed)throw new HttpException('STAFF_AUTH_RATE_LIMIT',429);
  }
  private async kdf<T>(work:()=>Promise<T>):Promise<T>{
    try{return await work();}catch(e){
      if(e instanceof StaffPasswordError)throw e.message==='STAFF_AUTH_BUSY'?new HttpException(e.message,429):new BadRequestException(e.message);
      throw new HttpException('STAFF_AUTH_UNAVAILABLE',503);
    }
  }
  private email(value:unknown){
    if(typeof value!=='string'||value.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()))throw new UnauthorizedException('STAFF_LOGIN_FAILED');
    return value.trim().toLowerCase();
  }
  async login(body:{email:unknown;password:unknown},source:string){
    const org=this.scope(),email=this.email(body.email);
    await this.rate('staff.login.source',source,150);
    await this.rate('staff.login.account',email,8);
    const rows=(await this.db.query<{membership_id:string;password_hash:string;version:number}>(
      'SELECT * FROM app.staff_auth_lookup($1,$2)',[org,email])).rows;
    const row=rows.length===1?rows[0]:undefined;
    const correct=await this.kdf(()=>verifyStaffPassword(body.password,row?.password_hash||DUMMY_PASSWORD_HASH));
    if(!correct||!row)throw new UnauthorizedException('STAFF_LOGIN_FAILED');
    const token=randomBytes(32).toString('hex');
    const started=(await this.db.query<{ok:boolean}>('SELECT app.staff_auth_start($1,$2,$3) AS ok',[row.membership_id,row.version,staffTokenHash(token)])).rows[0]?.ok;
    if(!started)throw new UnauthorizedException('STAFF_LOGIN_FAILED');
    return {token,identity:await this.resolve(token)};
  }
  async accept(body:{token:unknown;password:unknown},purpose:'invite'|'reset',source:string){
    const org=this.scope();await this.rate('staff.accept.source',source,100);
    if(typeof body.token!=='string'||!TOKEN.test(body.token))throw new BadRequestException('STAFF_ACTIVATION_INVALID');
    await this.rate('staff.accept.token',body.token,8);
    const passwordHash=await this.kdf(()=>hashStaffPassword(body.password));
    const ok=(await this.db.query<{ok:boolean}>('SELECT app.staff_auth_accept($1,$2,$3,$4) AS ok',
      [org,staffTokenHash(body.token),purpose,passwordHash])).rows[0]?.ok;
    if(!ok)throw new BadRequestException('STAFF_ACTIVATION_INVALID');
    return {ok:true,loginRequired:true};
  }
  async resolve(token:unknown):Promise<StaffIdentity>{
    const org=this.scope();
    if(typeof token!=='string'||!TOKEN.test(token))throw new UnauthorizedException('STAFF_SESSION_REQUIRED');
    const row=(await this.db.query<{organization_id:string;user_id:string;membership_id:string;email:string;display_name:string;role_code:string;
      permissions:string[];property_ids:string[];expires_at:Date;credential_version:number;verification_channel:string}>(
      'SELECT * FROM app.staff_auth_resolve($1)',[staffTokenHash(token)])).rows[0];
    if(!row||row.organization_id!==org)throw new UnauthorizedException('STAFF_SESSION_REQUIRED');
    return {organizationId:row.organization_id,userId:row.user_id,membershipId:row.membership_id,email:row.email,
      displayName:row.display_name,role:row.role_code,permissions:row.permissions,propertyIds:row.property_ids,
      expiresAt:row.expires_at.toISOString(),credentialVersion:row.credential_version,emailVerified:row.verification_channel==='email'};
  }
  async logout(token:unknown,all=false){
    this.scope();if(typeof token==='string'&&TOKEN.test(token)){
      if(all)await this.resolve(token);
      await this.db.query('SELECT app.staff_auth_logout($1,$2)',[staffTokenHash(token),all]);
    }
    return {ok:true};
  }
  async change(token:unknown,body:{currentPassword:unknown;password:unknown}){
    const identity=await this.resolve(token);await this.rate('staff.password.change',identity.membershipId,8);
    const row=(await this.db.query<{membership_id:string;password_hash:string;version:number}>('SELECT * FROM app.staff_auth_lookup($1,$2)',
      [identity.organizationId,identity.email])).rows.find(r=>r.membership_id===identity.membershipId);
    if(!await this.kdf(()=>verifyStaffPassword(body.currentPassword,row?.password_hash||DUMMY_PASSWORD_HASH))||!row)
      throw new UnauthorizedException('STAFF_LOGIN_FAILED');
    const encoded=await this.kdf(()=>hashStaffPassword(body.password));
    const ok=(await this.db.query<{ok:boolean}>('SELECT app.staff_auth_change($1,$2,$3) AS ok',
      [staffTokenHash(token as string),row.version,encoded])).rows[0]?.ok;
    if(!ok)throw new UnauthorizedException('STAFF_SESSION_REQUIRED');
    return {ok:true,loginRequired:true};
  }
}
export function requireStaffPermission(identity:StaffIdentity,permission:string){
  if(!identity.permissions.includes(permission))throw new ForbiddenException('STAFF_PERMISSION_DENIED');
}
