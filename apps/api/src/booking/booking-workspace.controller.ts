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
  async read(@Headers() headers:IncomingHttpHeaders,@Query("propertyId") propertyId:string){
    let actor;
    try{actor={organizationId:requireUuid(single(headers["x-organization-id"]),"organization_id"),
      userId:requireUuid(single(headers["x-user-id"]),"user_id"),
      membershipId:requireUuid(single(headers["x-membership-id"]),"membership_id"),requestId:randomUUID()};}
    catch{throw new UnauthorizedException("valid actor context required");}
    try{propertyId=requireUuid(propertyId,"property_id");}catch{throw new BadRequestException("INVALID_PROPERTY_ID");}
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
