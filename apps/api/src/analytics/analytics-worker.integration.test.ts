import {afterAll,beforeAll,describe,expect,it} from "vitest";
import {DatabaseService} from "../database/database.service";
import {AnalyticsProjectionService} from "./analytics-projection.service";
import {AnalyticsWorkerService} from "./analytics-worker.service";
import {AnalyticsQueryService} from "./analytics-query.service";
import {AnalyticsRollupService} from "./analytics-rollup.service";

const ORG="00000000-0000-0000-0000-000000000001";
const PROPERTY="00000000-0000-0000-0000-000000000002";
const UNIT="00000000-0000-0000-0000-000000000004";
const RATE="00000000-0000-0000-0000-000000000008";
const USER="20000000-0000-4000-8000-000000000001";
const MEMBERSHIP="30000000-0000-4000-8000-000000000001";
const RESERVATION="d2000000-0000-4000-8000-000000000001";

const actor={
  organizationId:ORG,userId:USER,membershipId:MEMBERSHIP,requestId:"analytics-worker-test"
};

const db=new DatabaseService();
const projector=new AnalyticsProjectionService(db);
const rollups=new AnalyticsRollupService(db);
const worker=new AnalyticsWorkerService(db,projector,rollups);
const queries=new AnalyticsQueryService(db);

beforeAll(async()=>{
  await db.withActor(actor,async client=>{
    await client.query(
      `INSERT INTO reservations(
         id,organization_id,property_id,unit_id,rate_plan_id,confirmation_code,status,
         check_in_at,check_out_at,currency,accommodation_minor,total_minor,
         cancellation_policy_snapshot,quote_snapshot,created_at,updated_at,version
       ) VALUES(
         $1,$2,$3,$4,$5,'VW-ANALYTICS-WORKER','confirmed',
         '2027-02-10T14:00:00+05','2027-02-12T12:00:00+05',
         'UZS',1000,1000,'{}'::jsonb,'{}'::jsonb,
         '2027-02-01T12:00:00+05','2027-02-01T12:00:00+05',1
       )
       ON CONFLICT(id) DO NOTHING`,
      [RESERVATION,ORG,PROPERTY,UNIT,RATE]
    );

    await client.query(
      `INSERT INTO outbox_events(
         id,organization_id,aggregate_type,aggregate_id,event_type,idempotency_key,payload,occurred_at
       ) VALUES(
         gen_random_uuid(),$1,'reservation',$2,'booking.worker_test',
         $3,$4::jsonb,now()-interval '1 minute'
       )
       ON CONFLICT(idempotency_key) DO NOTHING`,
      [
        ORG,RESERVATION,
        "analytics-worker-test-event",
        JSON.stringify({reservationId:RESERVATION})
      ]
    );
  });
});

describe.sequential("Stage 6 analytics worker",()=>{
  it("leases a tenant and processes its pending analytics events",async()=>{
    const first=await worker.runCycle(10,100);
    expect(first.claimedTenants).toBeGreaterThanOrEqual(1);
    expect(first.failedTenants).toBe(0);

    const state=await db.withActor(actor,async client=>{
      const workerState=(await client.query<{
        lease_token:string|null;lease_until:Date|null;last_completed_at:Date|null;
        consecutive_failures:number;last_error_code:string|null;
      }>(
        `SELECT lease_token,lease_until,last_completed_at,consecutive_failures,last_error_code
           FROM analytics_worker_state
          WHERE organization_id=$1 AND consumer='analytics-core-v1'`,
        [ORG]
      )).rows[0];

      const consumed=(await client.query<{count:string}>(
        `SELECT count(*)::text AS count
           FROM analytics_projection_consumptions c
           JOIN outbox_events o ON o.id=c.outbox_event_id
          WHERE o.organization_id=$1
            AND o.idempotency_key='analytics-worker-test-event'
            AND c.consumer='analytics-core-v1'`,
        [ORG]
      )).rows[0];

      const rollup=(await client.query<{count:string}>(
        `SELECT count(*)::text AS count
           FROM analytics_property_daily_rollups
          WHERE organization_id=$1
            AND property_id=$2
            AND local_date BETWEEN '2027-02-10'::date AND '2027-02-11'::date`,
        [ORG,PROPERTY]
      )).rows[0];

      return {
        workerState,
        consumed:Number(consumed.count),
        rollupRows:Number(rollup.count)
      };
    });

    expect(state.workerState.lease_token).toBeNull();
    expect(state.workerState.lease_until).toBeNull();
    expect(state.workerState.last_completed_at).not.toBeNull();
    expect(state.workerState.consecutive_failures).toBe(0);
    expect(state.workerState.last_error_code).toBeNull();
    expect(state.consumed).toBe(1);
    expect(state.rollupRows).toBeGreaterThanOrEqual(2);
  });

  it("does not reclaim a tenant when no relevant pending event remains",async()=>{
    const second=await worker.runCycle(10,100);
    expect(second.results.some(x=>x.organizationId===ORG)).toBe(false);
  });

  it("reports critical SLO when relevant lag exceeds 30 minutes",async()=>{
    await db.withActor(actor,async client=>{
      await client.query(
        `INSERT INTO outbox_events(
           id,organization_id,aggregate_type,aggregate_id,event_type,idempotency_key,payload,occurred_at
         ) VALUES(
           gen_random_uuid(),$1,'reservation',$2,'booking.worker_slo_probe',
           $3,$4::jsonb,now()-interval '31 minutes'
         )
         ON CONFLICT(idempotency_key) DO NOTHING`,
        [
          ORG,RESERVATION,
          "analytics-worker-slo-probe",
          JSON.stringify({reservationId:RESERVATION})
        ]
      );
    });

    const health=await queries.projectionHealth(actor);
    expect(health.status).toBe("critical");
    expect(health.pendingEvents).toBeGreaterThanOrEqual(1);
    expect(health.oldestPendingAgeSeconds).toBeGreaterThanOrEqual(1800);
  });
});

afterAll(async()=>{await db.onModuleDestroy()});
