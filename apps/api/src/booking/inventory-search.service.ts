import {BadRequestException,Injectable} from '@nestjs/common';
import {DatabaseService} from '../database/database.service';
import type {RequestActorContext} from '../identity/actor-context';
import {calendarWindow} from '../owner/owner-calendar.input';
import {createHash} from 'node:crypto';
type SearchQuery={from?:unknown;to?:unknown;guests?:unknown;city?:unknown;cursor?:unknown};
type SearchRow={unitId:string;ratePlanId:string;propertyId:string;propertyName:Record<string,string>;city:string;unitTypeName:Record<string,string>;maxGuests:number;currency:string;baseNightlyMinor:string};
const UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
function parse(query:SearchQuery){
 try{calendarWindow(query.from,query.to);}catch{throw new BadRequestException('INVALID_SEARCH_DATES');}
 const guests=typeof query.guests==='number'?query.guests:Number(query.guests);
 if(!Number.isInteger(guests)||guests<1||guests>20)throw new BadRequestException('INVALID_GUEST_COUNT');
 const city=query.city===undefined?'':typeof query.city==='string'?query.city.trim():null;
 if(city===null||city.length>80)throw new BadRequestException('INVALID_SEARCH_CITY');
 const from=query.from as string,to=query.to as string;
 const digest=createHash('sha256').update(JSON.stringify({from,to,guests,city})).digest('hex');
 let after:string[]|null=null;
 if(query.cursor!==undefined){
  try{
   if(typeof query.cursor!=='string'||query.cursor.length>400)throw Error();
   const decoded:unknown=JSON.parse(Buffer.from(query.cursor,'base64url').toString('utf8'));
   if(!Array.isArray(decoded)||decoded.length!==3||decoded[0]!==digest||!decoded.slice(1).every(v=>typeof v==='string'&&UUID.test(v)))throw Error();
   after=decoded.slice(1);
  }catch{throw new BadRequestException('INVALID_SEARCH_CURSOR');}
 }
 return {from,to,guests,city,digest,after};
}
/** Staff catalog only. Booking remains QuoteService -> BookingHoldService; this
 * projection does not promise availability or a tax-inclusive payable price. */
@Injectable()
export class InventorySearchService{
 constructor(private readonly db:DatabaseService){}
 async search(actor:RequestActorContext,query:SearchQuery){
  const q=parse(query);
  return this.db.withActor(actor,async c=>{
   await c.query("SET LOCAL statement_timeout='5s'");
   const rows=(await c.query<SearchRow>(`SELECT u.id AS "unitId",rp.id AS "ratePlanId",p.id AS "propertyId",p.name AS "propertyName",p.city,
    ut.name AS "unitTypeName",ut.max_guests AS "maxGuests",rp.currency,rp.base_nightly_minor::text AS "baseNightlyMinor"
    FROM properties p JOIN units u ON u.property_id=p.id AND u.status='active'
    JOIN unit_types ut ON ut.id=u.unit_type_id AND ut.property_id=p.id
    JOIN rate_plans rp ON rp.property_id=p.id AND rp.unit_type_id=ut.id AND rp.active
    JOIN cancellation_policy_templates cp ON cp.id=rp.cancellation_policy_id AND cp.organization_id=p.organization_id AND cp.active
    WHERE p.organization_id=$1 AND p.status='active' AND app.registry_access(p.organization_id,p.id,'reservation.read')
     AND ut.max_guests>=$2 AND ($3='' OR lower(p.city)=lower($3))
     AND ($4::uuid IS NULL OR (u.id,rp.id)>($4::uuid,$5::uuid))
     AND NOT EXISTS(SELECT 1 FROM inventory_periods ip WHERE ip.unit_id=u.id
      AND ip.stay_period&&tstzrange(($6::date+time '14:00') AT TIME ZONE p.timezone,($7::date+time '12:00') AT TIME ZONE p.timezone,'[)'))
    ORDER BY u.id,rp.id LIMIT 51`,[actor.organizationId,q.guests,q.city,q.after?.[0]??null,q.after?.[1]??null,q.from,q.to])).rows;
   const items=rows.slice(0,50),last=items.at(-1);
   return {items,nextCursor:rows.length>50&&last?Buffer.from(JSON.stringify([q.digest,last.unitId,last.ratePlanId])).toString('base64url'):null,
    priceKind:'base_nightly_excludes_charges' as const,requiresQuote:true,checkInLocalTime:'14:00',checkOutLocalTime:'12:00'};
  });
 }
}
