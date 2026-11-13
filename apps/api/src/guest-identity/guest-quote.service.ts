import {BadRequestException,ConflictException,ForbiddenException,Injectable,NotFoundException,UnauthorizedException} from '@nestjs/common';
import {createHash} from 'node:crypto';
import {DatabaseService} from '../database/database.service';
import {StaffAuthService} from '../staff-auth/staff-auth.service';
import {GuestIdentityService} from './guest-identity.service';
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
const uuid=(s:unknown)=>{if(typeof s!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(s))throw new BadRequestException('GUEST_QUOTE_INPUT_INVALID');return s;};
@Injectable()
export class GuestQuoteService{
 constructor(private readonly db:DatabaseService,private readonly staff:StaffAuthService,private readonly guest:GuestIdentityService){}
 private enabled(){if(process.env.NODE_ENV!=='test'||process.env.VIEWS_LOCAL_REHEARSAL!=='true'||process.env.VIEWS_GUEST_QUOTES_PILOT_ENABLED!=='true')throw new NotFoundException('GUEST_QUOTES_DISABLED');}
 private async query(sql:string,args:unknown[]){try{return (await this.db.query<{result:Record<string,unknown>}>(sql,args)).rows[0].result;}catch(e){
  switch((e as {code?:string}).code){case '28000':throw new UnauthorizedException('GUEST_SESSION_INVALID');case '42501':throw new ForbiddenException('GUEST_QUOTE_STAFF_DENIED');case '23505':throw new ConflictException('GUEST_QUOTE_CONFLICT');case 'P0002':throw new NotFoundException('GUEST_QUOTE_NOT_FOUND');default:throw e;}
 }}
 async issue(token:unknown,id:unknown,profile:unknown){this.enabled();await this.staff.resolve(token);return this.query('SELECT app.issue_guest_quote($1,$2,$3) result',[hash(token as string),uuid(id),uuid(profile)]);}
 async read(token:string,id:unknown){this.enabled();await this.guest.session(token);return this.query('SELECT app.read_guest_quote($1,$2) result',[hash(token),uuid(id)]);}
}
