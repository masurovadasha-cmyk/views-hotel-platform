import {BadRequestException,Injectable,NotFoundException,UnauthorizedException} from '@nestjs/common';
import {createHash} from 'node:crypto';
import {DatabaseService} from '../database/database.service';
import {GuestEmailService} from './guest-email.service';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
type Row={id:string;confirmation_code:string;status:string;check_in_at:Date;check_out_at:Date;currency:string;total_minor:string;
 property_name:Record<string,string>;city:string;timezone:string;cursor_time:string};
export function tripCursor(raw:unknown):[string|null,string|null]{
 if(raw===undefined)return [null,null];
 try{
  if(typeof raw!=='string'||raw.length>300||! /^[A-Za-z0-9_-]+$/.test(raw))throw Error();
  const pair:unknown=JSON.parse(Buffer.from(raw,'base64url').toString('utf8'));
  if(!Array.isArray(pair)||pair.length!==2||typeof pair[0]!=='string'||typeof pair[1]!=='string'
   ||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(pair[0])||!UUID.test(pair[1])
   ||pair[0].startsWith('0000')||!Number.isFinite(Date.parse(pair[0]))||new Date(pair[0]).toISOString()!==pair[0].slice(0,23)+'Z')throw Error();
  return pair as [string,string];
 }catch{throw new BadRequestException('INVALID_GUEST_TRIP_CURSOR');}
}
function project(r:Row){return {id:r.id,confirmationCode:r.confirmation_code,status:r.status,checkInAt:r.check_in_at.toISOString(),
 checkOutAt:r.check_out_at.toISOString(),currency:r.currency,totalMinor:r.total_minor,property:{name:r.property_name,city:r.city,timezone:r.timezone}};}
@Injectable()
export class GuestTripsService{
 constructor(private readonly db:DatabaseService,private readonly auth:GuestEmailService){}
 private async rows(token:string,cursor:unknown,id?:string){
  if(process.env.VIEWS_GUEST_TRIPS_PILOT_ENABLED!=='true')throw new NotFoundException('GUEST_TRIPS_DISABLED');
  await this.auth.session(token);
  if(id!==undefined&&!UUID.test(id))throw new NotFoundException('GUEST_TRIP_NOT_FOUND');
  const [time,afterId]=tripCursor(cursor);
  try{return (await this.db.query<Row>('SELECT * FROM app.guest_email_trips($1,$2,$3,$4)',[createHash('sha256').update(token).digest('hex'),time,afterId,id??null])).rows;}
  catch(error){if((error as {code?:string}).code==='28000')throw new UnauthorizedException('GUEST_EMAIL_SESSION_INVALID');throw error;}
 }
 async list(token:string,cursor?:unknown){
  const rows=await this.rows(token,cursor),items=rows.slice(0,20),last=items.at(-1);
  return {items:items.map(project),nextCursor:rows.length>20&&last?Buffer.from(JSON.stringify([last.cursor_time,last.id])).toString('base64url'):null};
 }
 async detail(token:string,id:string){const rows=await this.rows(token,undefined,id);if(!rows[0])throw new NotFoundException('GUEST_TRIP_NOT_FOUND');return {trip:project(rows[0])};}
}
