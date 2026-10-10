import {createHash,randomBytes,randomUUID} from "node:crypto";
import {Injectable} from "@nestjs/common";
import {DatabaseService} from "../database/database.service";
import type {RequestActorContext} from "../identity/actor-context";
import {assertComplianceRole} from "./compliance-authorization";

export type GuestAccessScope={
  sessionId:string;
  organizationId:string;
  reservationId:string;
  propertyId:string;
  expiresAt:string;
};

@Injectable()
export class GuestAccessService{
  constructor(private readonly db:DatabaseService){}

  async issue(actor:RequestActorContext,reservationId:string,ttlMinutes=24*60){
    if(!Number.isInteger(ttlMinutes)||ttlMinutes<15||ttlMinutes>7*24*60){
      throw new Error("INVALID_GUEST_ACCESS_TTL");
    }

    const token="vga_"+randomBytes(32).toString("base64url");
    const tokenHash=this.hashToken(token);
    const sessionId=randomUUID();
    const expiresAt=new Date(Date.now()+ttlMinutes*60_000);

    await this.db.withActor(actor,async client=>{
      await assertComplianceRole(client,actor.membershipId,["host","owner","manager","front_desk"]);

      const reservation=(await client.query<{property_id:string;status:string}>(
        "SELECT property_id,status FROM reservations WHERE id=$1",
        [reservationId]
      )).rows[0];
      if(!reservation)throw new Error("RESERVATION_NOT_FOUND");
      if(!["confirmed","checked_in"].includes(reservation.status)){
        throw new Error("GUEST_ACCESS_NOT_AVAILABLE");
      }

      const access=(await client.query<{allowed:boolean}>(
        "SELECT app.can_access_property($1::uuid) AS allowed",[reservation.property_id]
      )).rows[0]?.allowed;
      if(!access)throw new Error("PROPERTY_FORBIDDEN");

      await client.query(
        `INSERT INTO guest_access_sessions(
           id,organization_id,reservation_id,token_hash,created_by_user_id,created_by_membership_id,expires_at
         ) VALUES($1,$2,$3,$4,$5,$6,$7)`,
        [sessionId,actor.organizationId,reservationId,tokenHash,actor.userId,actor.membershipId,expiresAt]
      );

      await client.query(
        `INSERT INTO outbox_events(
           id,organization_id,aggregate_type,aggregate_id,event_type,idempotency_key,payload
         ) VALUES(gen_random_uuid(),$1,'guest_access_session',$2,'compliance.guest_access_issued',$3,$4::jsonb)
         ON CONFLICT(idempotency_key) DO NOTHING`,
        [
          actor.organizationId,sessionId,
          "compliance:guest-access-issued:"+sessionId,
          JSON.stringify({sessionId,reservationId,expiresAt:expiresAt.toISOString()})
        ]
      );
    });

    return {sessionId,accessToken:token,expiresAt:expiresAt.toISOString()};
  }

  async resolve(accessToken:string):Promise<GuestAccessScope>{
    const token=String(accessToken||"").trim();
    if(token.length<32||token.length>256||!token.startsWith("vga_")){
      throw new Error("GUEST_ACCESS_UNAUTHORIZED");
    }

    const result=await this.db.query<{
      session_id:string;organization_id:string;reservation_id:string;property_id:string;expires_at:Date;
    }>(
      "SELECT * FROM app.resolve_guest_access_session($1)",
      [this.hashToken(token)]
    );
    const row=result.rows[0];
    if(!row)throw new Error("GUEST_ACCESS_UNAUTHORIZED");

    return {
      sessionId:row.session_id,
      organizationId:row.organization_id,
      reservationId:row.reservation_id,
      propertyId:row.property_id,
      expiresAt:row.expires_at.toISOString()
    };
  }

  async revoke(actor:RequestActorContext,sessionId:string){
    return this.db.withActor(actor,async client=>{
      await assertComplianceRole(client,actor.membershipId,["host","owner","manager","front_desk"]);
      const row=(await client.query<{reservation_id:string;revoked_at:Date}>(
        `UPDATE guest_access_sessions
            SET revoked_at=COALESCE(revoked_at,now())
          WHERE id=$1
          RETURNING reservation_id,revoked_at`,
        [sessionId]
      )).rows[0];
      if(!row)throw new Error("GUEST_ACCESS_SESSION_NOT_FOUND");

      await client.query(
        `INSERT INTO outbox_events(
           id,organization_id,aggregate_type,aggregate_id,event_type,idempotency_key,payload
         ) VALUES(gen_random_uuid(),$1,'guest_access_session',$2,'compliance.guest_access_revoked',$3,$4::jsonb)
         ON CONFLICT(idempotency_key) DO NOTHING`,
        [
          actor.organizationId,sessionId,
          "compliance:guest-access-revoked:"+sessionId,
          JSON.stringify({sessionId,reservationId:row.reservation_id})
        ]
      );

      return {
        sessionId,status:"revoked" as const,revokedAt:row.revoked_at.toISOString()
      };
    });
  }

  private hashToken(token:string){
    return createHash("sha256").update(token).digest("hex");
  }
}
