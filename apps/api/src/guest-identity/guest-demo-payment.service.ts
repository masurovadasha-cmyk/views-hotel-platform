import {BadRequestException,ConflictException,Injectable,NotFoundException,UnauthorizedException} from '@nestjs/common';
import {createHash} from 'node:crypto';
import {DatabaseService} from '../database/database.service';
import {PaymentWebhookService} from '../payments/payment-webhook.service';
import {GuestIdentityService} from './guest-identity.service';
@Injectable()
export class GuestDemoPaymentService{
 constructor(private readonly db:DatabaseService,private readonly guest:GuestIdentityService,private readonly payments:PaymentWebhookService){}
 async pay(token:string,reservationId:unknown){
  if(process.env.NODE_ENV!=='test'||process.env.VIEWS_LOCAL_REHEARSAL!=='true'||process.env.VIEWS_DEMO_PAYMENTS_ENABLED!=='true')throw new NotFoundException('DEMO_PAYMENTS_DISABLED');
  if(typeof reservationId!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(reservationId))throw new BadRequestException('DEMO_PAYMENT_INPUT_INVALID');
  await this.guest.session(token);const digest=createHash('sha256').update(token).digest('hex');
  try{
   const org=(await this.db.query<{org:string}>('SELECT app.demo_payment_owner($1,$2) org',[digest,reservationId])).rows[0].org;
   return await this.db.withOrganization(org,async client=>{
    const p=(await client.query<{p:{id:string;organizationId:string;amountMinor:string;currency:string;occurredAt:string}}>('SELECT app.prepare_guest_demo_payment($1,$2) p',[digest,reservationId])).rows[0].p;
    const raw={organizationId:org,paymentIntentId:p.id,externalEventId:'demo:'+p.id,externalTransactionId:'demo:'+p.id,eventType:'captured' as const,amountMinor:p.amountMinor,currency:p.currency,occurredAt:p.occurredAt,rawMetadata:{simulation:true}};
    await this.payments.processVerifiedInTransaction(client,'demo',{...raw,amountMinor:BigInt(p.amountMinor)},JSON.stringify(raw));
    await client.query('SELECT app.demo_payment_owner($1,$2)',[digest,reservationId]);
    const result=(await client.query<{paymentStatus:string;bookingStatus:string}>(`SELECT pi.status AS "paymentStatus",r.status AS "bookingStatus" FROM payment_intents pi JOIN reservations r ON r.id=pi.reservation_id WHERE pi.id=$1`,[p.id])).rows[0];
    return {simulation:true,paymentIntentId:p.id,reservationId,amountMinor:p.amountMinor,currency:p.currency,...result};
   });
  }catch(e){switch((e as {code?:string}).code){case '28000':throw new UnauthorizedException('GUEST_SESSION_INVALID');case 'P0002':throw new NotFoundException('DEMO_BOOKING_NOT_FOUND');case '42501':throw new NotFoundException('DEMO_PAYMENTS_DISABLED');case '22023':throw new ConflictException('DEMO_PAYMENT_UNAVAILABLE');default:throw e;}}
 }
}
