import {afterAll,beforeAll,describe,expect,it} from "vitest";
import {DatabaseService} from "../database/database.service";
import {AnalyticsDashboardService} from "./analytics-dashboard.service";

const ORG="00000000-0000-0000-0000-000000000001";
const PROPERTY="00000000-0000-0000-0000-000000000002";

const MANAGER={
  organizationId:ORG,
  userId:"20000000-0000-4000-8000-000000000001",
  membershipId:"30000000-0000-4000-8000-000000000001",
  requestId:"dashboard-hardening-manager"
};

const HOST={
  organizationId:ORG,
  userId:"20000000-0000-4000-8000-000000000004",
  membershipId:"30000000-0000-4000-8000-000000000004",
  requestId:"dashboard-hardening-host"
};

const db=new DatabaseService();
const dashboard=new AnalyticsDashboardService(db);

beforeAll(async()=>{
  await db.withActor(MANAGER,async client=>{
    await client.query(
      `INSERT INTO analytics_property_daily_rollups(
         organization_id,property_id,local_date,currency,
         available_unit_nights,occupied_unit_nights,booking_count,
         accommodation_revenue_minor,gross_revenue_minor,net_revenue_minor,
         occupancy,adr_minor,revpar_minor,avg_lead_time_days,avg_stay_nights,refreshed_at
       ) VALUES
       ($1,$2,'2035-02-01','UZS',10,5,2,5000,5500,5000,0.5,1000,500,10,2,'2035-02-02T00:00:00Z'),
       ($1,$2,'2035-02-01','USD',10,1,1,1000,1100,1000,0.1,1000,100,5,1,'2035-02-02T00:00:00Z')
       ON CONFLICT(organization_id,property_id,local_date,currency)
       DO UPDATE SET
         available_unit_nights=EXCLUDED.available_unit_nights,
         occupied_unit_nights=EXCLUDED.occupied_unit_nights,
         booking_count=EXCLUDED.booking_count,
         accommodation_revenue_minor=EXCLUDED.accommodation_revenue_minor,
         gross_revenue_minor=EXCLUDED.gross_revenue_minor,
         net_revenue_minor=EXCLUDED.net_revenue_minor,
         occupancy=EXCLUDED.occupancy,
         adr_minor=EXCLUDED.adr_minor,
         revpar_minor=EXCLUDED.revpar_minor,
         avg_lead_time_days=EXCLUDED.avg_lead_time_days,
         avg_stay_nights=EXCLUDED.avg_stay_nights,
         refreshed_at=EXCLUDED.refreshed_at`,
      [ORG,PROPERTY]
    );
  });
});

describe.sequential("Stage 6 dashboard hardening",()=>{
  it("hides a stale broad-scope organization cache after host scope reduction",async()=>{
    const stale=await db.withActor(HOST,async client=>{
      return (await client.query<{cache_key:string}>(
        "SELECT cache_key FROM analytics_dashboard_cache WHERE cache_key=repeat('e',64)"
      )).rows;
    });
    expect(stale).toHaveLength(0);

    const result=await dashboard.summary(HOST,{
      from:"2035-01-01",
      to:"2035-01-01",
      propertyId:null
    }) as any;

    expect(result.cache.hit).toBe(false);
    expect(result.freshness.scopePropertyCount).toBe(1);

    const visible=await db.withActor(HOST,async client=>{
      return (await client.query<{cache_key:string;property_ids:string[]}>(
        `SELECT cache_key,property_ids
           FROM analytics_dashboard_cache
          WHERE organization_id=$1
            AND membership_id=$2
            AND from_date='2035-01-01'
            AND to_date='2035-01-01'
          ORDER BY generated_at`,
        [ORG,HOST.membershipId]
      )).rows;
    });

    expect(visible).toHaveLength(1);
    expect(visible[0].cache_key).not.toBe("e".repeat(64));
    expect(visible[0].property_ids).toEqual([PROPERTY]);
  });

  it("changes fingerprint when source row count changes but max timestamp stays the same",async()=>{
    const before=await dashboard.summary(MANAGER,{
      from:"2035-02-01",
      to:"2035-02-01",
      propertyId:PROPERTY
    }) as any;

    expect(before.freshness.rollupRowCount).toBe(2);
    expect(before.freshness.rollupRefreshedAt).toBe("2035-02-02T00:00:00.000Z");

    await db.withActor(MANAGER,async client=>{
      await client.query(
        `DELETE FROM analytics_property_daily_rollups
          WHERE organization_id=$1
            AND property_id=$2
            AND local_date='2035-02-01'
            AND currency='USD'`,
        [ORG,PROPERTY]
      );
    });

    const after=await dashboard.summary(MANAGER,{
      from:"2035-02-01",
      to:"2035-02-01",
      propertyId:PROPERTY
    }) as any;

    expect(after.freshness.rollupRowCount).toBe(1);
    expect(after.freshness.rollupRefreshedAt).toBe("2035-02-02T00:00:00.000Z");
    expect(after.freshness.sourceFingerprint)
      .not.toBe(before.freshness.sourceFingerprint);
    expect(after.cache.hit).toBe(false);
  });
});

afterAll(async()=>{await db.onModuleDestroy()});
