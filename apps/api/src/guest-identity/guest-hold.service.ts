import {BadRequestException,ConflictException,Injectable,NotFoundException,UnauthorizedException} from '@nestjs/common';
import {createHash} from 'node:crypto';
import {DatabaseService} from '../database/database.service';
import {GuestIdentityService} from './guest-identity.service';
export type GuestHoldResult={reservationId:string;confirmationCode:string;status:'hold';holdExpiresAt:string;totalMinor:string;currency:string;idempotentReplay:boolean};
const uuid=(value:unknown)=>{if(typeof value!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value))throw new BadRequestException('GUEST_HOLD_INPUT_INVALID');return value;};
@Injectable()
export class GuestHoldService{
 constructor(private readonly db:DatabaseService,private readonly guest:GuestIdentityService){}
 async create(token:string,quoteId:unknown,key:unknown):Promise<GuestHoldResult>{
  if(process.env.NODE_ENV!=='test'||process.env.VIEWS_LOCAL_REHEARSAL!=='true'||process.env.VIEWS_GUEST_HOLDS_PILOT_ENABLED!=='true')throw new NotFoundException('GUEST_HOLDS_DISABLED');
  const target=uuid(quoteId),command=uuid(key);await this.guest.session(token);
  try{
   // Ten minutes is the local demo policy; clients cannot extend the hold.
   const result=await this.db.query<{result:GuestHoldResult}>('SELECT app.create_guest_hold($1,$2,$3,$4) result',[createHash('sha256').update(token).digest('hex'),target,command,600]);
   return result.rows[0].result;
  }catch(error){
   switch((error as {code?:string}).code){
    case '28000':throw new UnauthorizedException('GUEST_SESSION_INVALID');
    case 'P0002':throw new NotFoundException('GUEST_QUOTE_NOT_FOUND');
    case '23505':throw new ConflictException('GUEST_HOLD_COMMAND_CONFLICT');
    case '23P01':throw new ConflictException('GUEST_UNIT_UNAVAILABLE');
    case '22023':throw new ConflictException('GUEST_HOLD_UNAVAILABLE');
    default:throw error;
   }
  }
 }
}
