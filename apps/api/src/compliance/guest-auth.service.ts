import {createHash,randomBytes,randomUUID} from "node:crypto";
import {Injectable} from "@nestjs/common";
import {DatabaseService} from "../database/database.service";
import type {RequestActorContext} from "../identity/actor-context";
import {SecurityRateLimitService} from "../security/rate-limit.service";
import {assertComplianceRole} from "./compliance-authorization";
import type {GuestAuthChannel} from "./guest-auth-delivery.port";
import {GuestAuthProviderRegistry} from "./guest-auth-provider.registry";

const CHALLENGE_LIMIT=5;
const CHALLENGE_WINDOW_SECONDS=15*60;
const EXCHANGE_NETWORK_LIMIT=60;
const EXCHANGE_TOKEN_LIMIT=6;
const EXCHANGE_WINDOW_SECONDS=5*60;

@Injectable()
export class GuestAuthService{
  constructor(
    private readonly db:DatabaseService,
    private readonly providers:GuestAuthProviderRegistry,
    private readonly rateLimits:SecurityRateLimitService
  ){}

  connectedProviders(){return this.providers.connected()}

  async createChallenge(
    actor:RequestActorContext,
    reservationId:string,
    channel:GuestAuthChannel,
    ttlMinutes=15
  ){
    if(!["email","sms"].includes(channel))throw new Error("INVALID_GUEST_AUTH_CHANNEL");
    if(!Number.isInteger(ttlMinutes)||ttlMinutes<5||ttlMinutes>60){
      throw new Error("INVALID_GUEST_AUTH_TTL");
    }

    const delivery=this.providers.delivery(channel);
    const challengeId=randomUUID();
    const exchangeToken="vge_"+randomBytes(32).toString("base64url");
    const tokenHash=this.hash(exchangeToken);
    const expiresAt=new Date(Date.now()+ttlMinutes*60_000);

    const context=await this.db.withActor(actor,async client=>{
      await assertComplianceRole(client,actor.membershipId,["host","owner","manager","front_desk"]);

      const row=(await client.query<{
        property_id:string;status:string;email:string|null;phone_e164:string|null;
      }>(
        `SELECT r.property_id,r.status,gp.email,gp.phone_e164
           FROM reservations r
           LEFT JOIN reservation_guests rg
             ON rg.reservation_id=r.id
            AND rg.organization_id=r.organization_id
            AND rg.is_primary=true
           LEFT JOIN guest_profiles gp
             ON gp.id=rg.guest_profile_id
            AND gp.organization_id=r.organization_id
          WHERE r.id=$1
            AND r.organization_id=$2`,
        [reservationId,actor.organizationId]
      )).rows[0];

      if(!row)throw new Error("RESERVATION_NOT_FOUND");
      if(!["confirmed","checked_in"].includes(row.status)){
        throw new Error("GUEST_ACCESS_NOT_AVAILABLE");
      }

      const access=(await client.query<{allowed:boolean}>(
        "SELECT app.can_access_property($1::uuid) AS allowed",[row.property_id]
      )).rows[0]?.allowed;
      if(!access)throw new Error("PROPERTY_FORBIDDEN");

      const rawDestination=channel==="email"?row.email:row.phone_e164;
      const destination=this.normalizeDestination(channel,rawDestination);
      if(!destination)throw new Error("GUEST_AUTH_DESTINATION_MISSING");

      return {destination};
    });

    await this.rateLimits.consume(
      "guest_auth.challenge.reservation",
      this.hash(actor.organizationId+":"+reservationId+":"+channel),
      CHALLENGE_LIMIT,
      CHALLENGE_WINDOW_SECONDS
    );

    await this.db.withActor(actor,async client=>{
      await client.query(
        `INSERT INTO guest_access_challenges(
           id,organization_id,reservation_id,channel,destination_hash,token_hash,
           delivery_status,expires_at,created_by_user_id,created_by_membership_id
         ) VALUES($1,$2,$3,$4,$5,$6,'pending',$7,$8,$9)`,
        [
          challengeId,actor.organizationId,reservationId,channel,this.hash(context.destination),
          tokenHash,expiresAt,actor.userId,actor.membershipId
        ]
      );
    });

    try{
      const delivered=await delivery.send({
        organizationId:actor.organizationId,
        reservationId,
        destination:context.destination,
        exchangeToken,
        expiresAt:expiresAt.toISOString()
      });

      await this.db.withActor(actor,async client=>{
        await client.query(
          `UPDATE guest_access_challenges
              SET delivery_status='delivered',
                  provider_message_id=$2,
                  last_error=NULL,
                  updated_at=now()
            WHERE id=$1`,
          [challengeId,delivered.messageId??null]
        );

        await client.query(
          `INSERT INTO outbox_events(
             id,organization_id,aggregate_type,aggregate_id,event_type,idempotency_key,payload
           ) VALUES(
             gen_random_uuid(),$1,'guest_auth_challenge',$2,
             'identity.guest_auth_challenge_delivered',$3,$4::jsonb
           )
           ON CONFLICT(idempotency_key) DO NOTHING`,
          [
            actor.organizationId,challengeId,
            "identity:guest-auth-delivered:"+challengeId,
            JSON.stringify({challengeId,reservationId,channel,expiresAt:expiresAt.toISOString()})
          ]
        );
      });

      return {
        challengeId,channel,status:"delivered" as const,expiresAt:expiresAt.toISOString()
      };
    }catch{
      await this.db.withActor(actor,async client=>{
        await client.query(
          `UPDATE guest_access_challenges
              SET delivery_status='failed',last_error=$2,updated_at=now()
            WHERE id=$1`,
          [challengeId,"GUEST_AUTH_DELIVERY_FAILED"]
        );
      });
      throw new Error("GUEST_AUTH_DELIVERY_FAILED");
    }
  }

  async exchange(
    exchangeToken:string,
    sessionTtlMinutes=24*60,
    clientNetworkKeyHash:string
  ){
    await this.rateLimits.consume(
      "guest_auth.exchange.network",
      clientNetworkKeyHash,
      EXCHANGE_NETWORK_LIMIT,
      EXCHANGE_WINDOW_SECONDS
    );

    const token=String(exchangeToken||"").trim();
    if(token.length<32||token.length>256||!token.startsWith("vge_")){
      throw new Error("GUEST_AUTH_CHALLENGE_INVALID");
    }
    if(!Number.isInteger(sessionTtlMinutes)||sessionTtlMinutes<15||sessionTtlMinutes>7*24*60){
      throw new Error("INVALID_GUEST_ACCESS_TTL");
    }

    const tokenHash=this.hash(token);
    await this.rateLimits.consume(
      "guest_auth.exchange.token",
      tokenHash,
      EXCHANGE_TOKEN_LIMIT,
      EXCHANGE_WINDOW_SECONDS
    );

    const accessToken="vga_"+randomBytes(32).toString("base64url");
    const result=await this.db.query<{
      session_id:string;organization_id:string;reservation_id:string;property_id:string;expires_at:Date;
    }>(
      "SELECT * FROM app.exchange_guest_access_challenge($1,$2,$3)",
      [tokenHash,this.hash(accessToken),sessionTtlMinutes]
    );
    const row=result.rows[0];
    if(!row)throw new Error("GUEST_AUTH_CHALLENGE_INVALID");

    return {
      sessionId:row.session_id,
      accessToken,
      expiresAt:row.expires_at.toISOString(),
      reservationId:row.reservation_id
    };
  }

  private normalizeDestination(channel:GuestAuthChannel,value:string|null|undefined){
    const trimmed=String(value||"").trim();
    if(!trimmed)return null;
    if(channel==="email"){
      const normalized=trimmed.toLowerCase();
      if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized))return null;
      return normalized;
    }
    if(!/^\+[1-9]\d{7,14}$/.test(trimmed))return null;
    return trimmed;
  }

  private hash(value:string){
    return createHash("sha256").update(value).digest("hex");
  }
}
