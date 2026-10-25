import {BadRequestException,Injectable,NotFoundException,UnauthorizedException} from '@nestjs/common';
import {createHash} from 'node:crypto';
import {DatabaseService} from '../database/database.service';
import {type RequestActorContext} from '../identity/actor-context';
import {calendarId} from './owner-calendar.input';
export function ownerServicesInput(property:unknown,query:Record<string,unknown>){
 try{
  const propertyId=calendarId(property);
  if(Object.keys(query).some(k=>!['kind','after','limit'].includes(k))||!['catalog','orders'].includes(query.kind as string))throw Error();
  const after=query.after===undefined?null:calendarId(query.after);
  const raw=query.limit===undefined?'20':query.limit;
  if(typeof raw!=='string'||!/^([1-9]|[1-4][0-9]|50)$/.test(raw))throw Error();
  return {propertyId,kind:query.kind as 'catalog'|'orders',after,limit:Number(raw)};
 }catch{throw new BadRequestException('OWNER_SERVICES_INPUT_INVALID');}
}
@Injectable()
export class OwnerServicesService{
 constructor(private readonly db:DatabaseService){}
 async list(actor:RequestActorContext,session:string,property:unknown,query:Record<string,unknown>){
  if(process.env.NODE_ENV!=='test'||process.env.VIEWS_LOCAL_REHEARSAL!=='true'||process.env.VIEWS_OWNER_SERVICES_ENABLED!=='true')throw new NotFoundException('OWNER_SERVICES_DISABLED');
  const input=ownerServicesInput(property,query);
  if(!/^[a-f0-9]{64}$/.test(session))throw new UnauthorizedException('STAFF_SESSION_REQUIRED');
  const hash=createHash('sha256').update(session).digest('hex');
  return this.db.withActor(actor,async c=>{
   await c.query("SET LOCAL statement_timeout='5s'");
   const authorize=async()=>{if(!(await c.query('SELECT app.owner_calendar_authorize($1,$2) allowed',[hash,input.propertyId])).rows[0]?.allowed)throw new UnauthorizedException('STAFF_SESSION_REQUIRED');};
   await authorize();
   const result=(await c.query('SELECT app.owner_services_page($1,$2,$3,$4,$5) result',[hash,input.propertyId,input.kind,input.after,input.limit])).rows[0].result;
   await authorize();return result;
  });
 }
}
