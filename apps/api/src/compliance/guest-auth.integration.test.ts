import {afterAll,beforeAll,describe,expect,it} from "vitest";
import {DatabaseService} from "../database/database.service";
import {SecurityRateLimitService} from "../security/rate-limit.service";
import {GuestAccessService} from "./guest-access.service";
import type {GuestAuthDeliveryInput,GuestAuthDeliveryPort} from "./guest-auth-delivery.port";
import {GuestAuthProviderRegistry} from "./guest-auth-provider.registry";
import {GuestAuthService} from "./guest-auth.service";

const ORG="00000000-0000-0000-0000-000000000001";
const PROPERTY="00000000-0000-0000-0000-000000000002";
const UNIT="00000000-0000-0000-0000-000000000004";
const RATE="00000000-0000-0000-0000-000000000008";
const USER="20000000-0000-4000-8000-000000000001";
const MEMBERSHIP="30000000-0000-4000-8000-000000000001";

const GUEST_PROFILE="b1000000-0000-4000-8000-000000000001";
const RESERVATION="b2000000-0000-4000-8000-000000000001";
const RESERVATION_GUEST="b3000000-0000-4000-8000-000000000001";
const EMAIL="guest.auth@example.test";
const NETWORK_KEY="c".repeat(64);

const actor={
  organizationId:ORG,userId:USER,membershipId:MEMBERSHIP,requestId:"guest-auth-integration"
};

class TestEmailDelivery implements GuestAuthDeliveryPort{
  readonly channel="email" as const;
  lastInput:GuestAuthDeliveryInput|null=null;

  async send(input:GuestAuthDeliveryInput){
    this.lastInput=input;
    return {messageId:"guest-auth-test-message"};
  }
}

const db=new DatabaseService();
const delivery=new TestEmailDelivery();
const providers=new GuestAuthProviderRegistry();
providers.register(delivery);
const rateLimits=new SecurityRateLimitService(db);
const auth=new GuestAuthService(db,providers,rateLimits);
const access=new GuestAccessService(db);

beforeAll(async()=>{
  await db.withActor(actor,async client=>{
    await client.query(
      `INSERT INTO guest_profiles(
         id,organization_id,first_name,last_name,email,preferred_locale
       ) VALUES($1,$2,'Alex','Johnson',$3,'en')
       ON CONFLICT(id) DO UPDATE SET email=EXCLUDED.email`,
      [GUEST_PROFILE,ORG,EMAIL]
    );

    await client.query(
      `INSERT INTO reservations(
         id,organization_id,property_id,unit_id,rate_plan_id,confirmation_code,status,
         check_in_at,check_out_at,currency,accommodation_minor,total_minor,
         cancellation_policy_snapshot,quote_snapshot
       ) VALUES(
         $1,$2,$3,$4,$5,'VW-GUEST-AUTH-1','confirmed',
         '2028-01-10T14:00:00+05','2028-01-12T12:00:00+05',
         'UZS',1000000,1000000,'{}'::jsonb,'{}'::jsonb
       )
       ON CONFLICT(id) DO NOTHING`,
      [RESERVATION,ORG,PROPERTY,UNIT,RATE]
    );

    await client.query(
      `INSERT INTO reservation_guests(
         id,organization_id,reservation_id,guest_profile_id,is_primary,
         first_name,last_name,date_of_birth,nationality_country_code,residency_country_code
       ) VALUES($1,$2,$3,$4,true,'Alex','Johnson','1991-05-10','DE','DE')
       ON CONFLICT(id) DO NOTHING`,
      [RESERVATION_GUEST,ORG,RESERVATION,GUEST_PROFILE]
    );
  });
});

describe.sequential("Stage 5 one-time guest auth exchange",()=>{
  it("delivers an exchange token without returning or persisting the raw secret",async()=>{
    const result=await auth.createChallenge(actor,RESERVATION,"email",15);

    expect(result.status).toBe("delivered");
    expect("exchangeToken" in result).toBe(false);
    expect(delivery.lastInput?.destination).toBe(EMAIL);
    expect(delivery.lastInput?.exchangeToken.startsWith("vge_")).toBe(true);

    const rawToken=delivery.lastInput?.exchangeToken;
    if(!rawToken)throw new Error("EXPECTED_DELIVERED_EXCHANGE_TOKEN");

    const stored=await db.withActor(actor,async client=>{
      return (await client.query<{
        token_hash:string;destination_hash:string;delivery_status:string;
        provider_message_id:string|null;last_error:string|null;
      }>(
        `SELECT token_hash,destination_hash,delivery_status,provider_message_id,last_error
           FROM guest_access_challenges
          WHERE id=$1`,
        [result.challengeId]
      )).rows[0];
    });

    expect(stored.token_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(stored.destination_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(stored.token_hash).not.toContain(rawToken);
    expect(stored.destination_hash).not.toContain(EMAIL);
    expect(stored.delivery_status).toBe("delivered");
    expect(stored.provider_message_id).toBe("guest-auth-test-message");
    expect(stored.last_error).toBeNull();
  });

  it("atomically exchanges the delivered token into a reservation-scoped session",async()=>{
    const challenge=await auth.createChallenge(actor,RESERVATION,"email",15);
    const rawToken=delivery.lastInput?.exchangeToken;
    if(!rawToken)throw new Error("EXPECTED_DELIVERED_EXCHANGE_TOKEN");

    const exchanged=await auth.exchange(rawToken,60,NETWORK_KEY);
    expect(exchanged.accessToken.startsWith("vga_")).toBe(true);
    expect(exchanged.reservationId).toBe(RESERVATION);

    const scope=await access.resolve(exchanged.accessToken);
    expect(scope.organizationId).toBe(ORG);
    expect(scope.propertyId).toBe(PROPERTY);
    expect(scope.reservationId).toBe(RESERVATION);

    const state=await db.withActor(actor,async client=>{
      const challengeRow=(await client.query<{consumed_at:Date|null}>(
        "SELECT consumed_at FROM guest_access_challenges WHERE id=$1",
        [challenge.challengeId]
      )).rows[0];
      const sessionRow=(await client.query<{token_hash:string}>(
        "SELECT token_hash FROM guest_access_sessions WHERE id=$1",
        [exchanged.sessionId]
      )).rows[0];
      const eventRow=(await client.query<{event_type:string}>(
        `SELECT event_type
           FROM outbox_events
          WHERE aggregate_type='guest_access_session'
            AND aggregate_id=$1
            AND event_type='identity.guest_access_exchanged'
          LIMIT 1`,
        [exchanged.sessionId]
      )).rows[0];
      return {challengeRow,sessionRow,eventRow};
    });

    expect(state.challengeRow.consumed_at).not.toBeNull();
    expect(state.sessionRow.token_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(state.sessionRow.token_hash).not.toContain(exchanged.accessToken);
    expect(state.eventRow.event_type).toBe("identity.guest_access_exchanged");

    await expect(auth.exchange(rawToken,60,NETWORK_KEY)).rejects.toThrow("GUEST_AUTH_CHALLENGE_INVALID");
  });

  it("rejects malformed exchange tokens",async()=>{
    await expect(auth.exchange("vge_not-a-real-token",60,NETWORK_KEY))
      .rejects.toThrow("GUEST_AUTH_CHALLENGE_INVALID");
  });

  it("reports an unconnected channel truthfully before creating a challenge",async()=>{
    const emptyProviders=new GuestAuthProviderRegistry();
    const isolatedAuth=new GuestAuthService(db,emptyProviders,rateLimits);

    await expect(isolatedAuth.createChallenge(actor,RESERVATION,"sms",15))
      .rejects.toThrow("GUEST_AUTH_DELIVERY_NOT_CONNECTED");

    const count=await db.withActor(actor,async client=>{
      return (await client.query<{count:string}>(
        `SELECT count(*)::text AS count
           FROM guest_access_challenges
          WHERE reservation_id=$1 AND channel='sms'`,
        [RESERVATION]
      )).rows[0].count;
    });
    expect(Number(count)).toBe(0);
  });
});

afterAll(async()=>{await db.onModuleDestroy()});
