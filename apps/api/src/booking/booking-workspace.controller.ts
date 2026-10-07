import {stayPilotEnabled} from './booking-stay.service';
import {BadRequestException,Controller,ForbiddenException,Get,Headers,Query,UnauthorizedException} from "@nestjs/common";
import type {IncomingHttpHeaders} from "node:http";
import {randomUUID} from "node:crypto";
import {DatabaseService} from "../database/database.service";
import {requireUuid} from "../identity/actor-context";

/** Read-only staff projection of the transactional Core; no parallel booking engine. */
@Controller("v1/booking-workspace")
export class BookingWorkspaceController{
  constructor(private readonly db:DatabaseService){}
  @Get()
  async read(@Headers() headers:IncomingHttpHeaders,@Query("propertyId") propertyId:string,@Query("day") day?:string){
    let actor;
    try{actor={organizationId:requireUuid(single(headers["x-organization-id"]),"organization_id"),
      userId:requireUuid(single(headers["x-user-id"]),"user_id"),
      membershipId:requireUuid(single(headers["x-membership-id"]),"membership_id"),requestId:randomUUID()};}
    catch{throw new UnauthorizedException("valid actor context required");}
    try{propertyId=requireUuid(propertyId,"property_id");}catch{throw new BadRequestException("INVALID_PROPERTY_ID");}
    if(day!==undefined&&day!=='today'&&(day.startsWith('0000')||!/^\d{4}-\d{2}-\d{2}$/.test(day)||!Number.isFinite(Date.parse(day))||new Date(day).toISOString().slice(0,10)!==day))throw new BadRequestException("INVALID_RECEPTION_DAY");
    return this.db.withActor(actor,async client=>{
      await client.query("SET LOCAL statement_timeout='5s'");
      const allowed=(await client.query<{allowed:boolean}>(`SELECT app.can_access_property($1::uuid) AND EXISTS(
        SELECT 1 FROM organization_memberships m
        JOIN role_permissions rp ON rp.role_id=m.role_id JOIN permissions p ON p.id=rp.permission_id
        WHERE m.id=$2 AND m.organization_id=$3 AND m.user_id=$4 AND m.status='active' AND p.code='reservation.read'
      ) AS allowed`,[propertyId,actor.membershipId,actor.organizationId,actor.userId])).rows[0]?.allowed;
      if(!allowed)throw new ForbiddenException("PROPERTY_FORBIDDEN");
      const property=(await client.query<{id:string;name:Record<string,string>;timezone:string}>(
        "SELECT id,name,timezone FROM properties WHERE id=$1 AND organization_id=$2",[propertyId,actor.organizationId])).rows[0];
      if(!property)throw new ForbiddenException("PROPERTY_FORBIDDEN");
      if(day!==undefined){
        const result=(await client.query(`WITH selected AS (
          SELECT CASE WHEN $3='today' THEN (clock_timestamp() AT TIME ZONE $4)::date ELSE $3::date END AS day
        ), grouped AS (
          SELECT bucket,r.id AS "reservationId",r.confirmation_code AS "confirmationCode",u.code AS "unitCode",r.status,r.version,
            r.check_in_at AS "checkInAt",r.check_out_at AS "checkOutAt",
            ($5::boolean AND r.quote_snapshot->'localStayPilot'='true'::jsonb AND r.total_minor=0) AS "stayPilot",
            CASE WHEN $5::boolean AND r.quote_snapshot->'localStayPilot'='true'::jsonb AND r.total_minor=0 THEN jsonb_build_object(
              'primaryGuest', (SELECT concat_ws(' ',g.first_name,g.last_name) FROM reservation_guests g WHERE g.reservation_id=r.id AND g.organization_id=r.organization_id AND g.is_primary),
              'unitActive',COALESCE(u.status='active' AND u.property_id=r.property_id,false),
              'inventoryValid',(SELECT count(*)=1 FROM inventory_periods ip WHERE ip.reservation_id=r.id AND ip.organization_id=r.organization_id AND ip.property_id=r.property_id AND ip.unit_id=r.unit_id AND ip.kind='reservation' AND ip.stay_period=tstzrange(r.check_in_at,r.check_out_at,'[)')),
              'paymentFree',NOT EXISTS(SELECT 1 FROM payment_intents pi WHERE pi.reservation_id=r.id),
              'timeAllowed',CASE WHEN r.status='confirmed' THEN clock_timestamp()>=r.check_in_at AND clock_timestamp()<r.check_out_at ELSE clock_timestamp()>r.check_in_at END,
              'unitVacant',r.status='checked_in' OR NOT EXISTS(SELECT 1 FROM reservations other WHERE other.unit_id=r.unit_id AND other.status='checked_in' AND other.id<>r.id)
            ) ELSE NULL END AS readiness
          FROM reservations r LEFT JOIN units u ON u.id=r.unit_id CROSS JOIN selected
          CROSS JOIN LATERAL unnest(ARRAY[
            CASE WHEN r.status='confirmed' AND (r.check_in_at AT TIME ZONE $4)::date=selected.day THEN 'arrivals' END,
            CASE WHEN r.status='checked_in' AND (r.check_out_at AT TIME ZONE $4)::date=selected.day THEN 'departures' END,
            CASE WHEN r.status='checked_in' THEN 'staying' END
          ]) bucket
          WHERE r.organization_id=$1 AND r.property_id=$2 AND bucket IS NOT NULL
        ), ranked AS (
          SELECT *,row_number() OVER(PARTITION BY bucket ORDER BY "checkInAt","reservationId") n FROM grouped
        ) SELECT (SELECT day::text FROM selected) AS day,clock_timestamp() AS "databaseTime",
          COALESCE(jsonb_object_agg(bucket,value),'{}'::jsonb) AS groups FROM (
            SELECT bucket,jsonb_build_object('total',count(*),'truncated',count(*)>100,
              'items',jsonb_agg(to_jsonb(ranked)-'bucket'-'n' ORDER BY n) FILTER(WHERE n<=100)) value
            FROM ranked GROUP BY bucket
          ) summaries`,[actor.organizationId,propertyId,day,property.timezone,stayPilotEnabled(actor.organizationId)])).rows[0];
        const empty={total:0,truncated:false,items:[]};
        return {property,day:result.day,databaseTime:result.databaseTime,
          arrivals:result.groups.arrivals||empty,departures:result.groups.departures||empty,staying:result.groups.staying||empty};
      }
      const units=(await client.query(`SELECT u.id AS "unitId",u.code,ut.name AS "unitTypeName",ut.max_guests AS "maxGuests",
        rp.id AS "ratePlanId",rp.name AS "rateName",rp.currency,rp.base_nightly_minor::text AS "baseNightlyMinor"
        FROM units u JOIN unit_types ut ON ut.id=u.unit_type_id
        JOIN rate_plans rp ON rp.property_id=u.property_id AND rp.unit_type_id=ut.id AND rp.active
        JOIN cancellation_policy_templates cp ON cp.id=rp.cancellation_policy_id AND cp.active
        WHERE u.property_id=$1 AND u.status='active' ORDER BY u.code,rp.id LIMIT 201`,[propertyId])).rows;
      const rows=(await client.query(`SELECT r.id AS "reservationId",r.confirmation_code AS "confirmationCode",r.unit_id AS "unitId",u.code AS "unitCode",
        r.status,r.check_in_at AS "checkInAt",r.check_out_at AS "checkOutAt",r.hold_expires_at AS "holdExpiresAt",
        r.total_minor::text AS "totalMinor",r.currency,
        (r.status='hold' AND r.hold_expires_at>now()) AS "activeHold"
        FROM reservations r JOIN units u ON u.id=r.unit_id
        WHERE r.organization_id=$1 AND r.property_id=$2 ORDER BY r.created_at DESC,r.id DESC LIMIT 51`,[actor.organizationId,propertyId])).rows;
      return {property,units:units.slice(0,200),unitsTruncated:units.length>200,
        reservations:rows.slice(0,50),reservationsTruncated:rows.length>50,
        databaseTime:(await client.query("SELECT clock_timestamp() AS time")).rows[0].time};
    });
  }
}
function single(value:string|string[]|undefined){return typeof value==="string"?value:undefined;}
