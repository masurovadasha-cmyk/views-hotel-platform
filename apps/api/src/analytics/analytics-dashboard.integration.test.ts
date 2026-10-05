import {afterAll,beforeAll,describe,expect,it} from "vitest";
import {DatabaseService} from "../database/database.service";
import {AnalyticsDashboardService} from "./analytics-dashboard.service";

const ORG="00000000-0000-0000-0000-000000000001";
const PROPERTY_A="00000000-0000-0000-0000-000000000002";
const PROPERTY_B="60000000-0000-4000-8000-000000000001";

const MANAGER={
  organizationId:ORG,
  userId:"20000000-0000-4000-8000-000000000001",
  membershipId:"30000000-0000-4000-8000-000000000001",
  requestId:"dashboard-manager"
};

const HOST={
  organizationId:ORG,
  userId:"20000000-0000-4000-8000-000000000004",
  membershipId:"30000000-0000-4000-8000-000000000004",
  requestId:"dashboard-host"
};

const DATE="2034-07-15";

const db=new DatabaseService();
const dashboards=new AnalyticsDashboardService(db);

beforeAll(async()=>{
  await db.withActor(MANAGER,async client=>{
    await client.query(
      `INSERT INTO properties(
         id,organization_id,name,country_code,city,timezone,address,status
       ) VALUES(
         $1,$2,'{"en":"Samarkand Dashboard Test"}'::jsonb,
         'UZ','Samarkand','Asia/Samarkand','{}'::jsonb,'active'
       )
       ON CONFLICT(id) DO UPDATE SET
         organization_id=EXCLUDED.organization_id,
         name=EXCLUDED.name,
         city=EXCLUDED.city,
         timezone=EXCLUDED.timezone,
         status='active'`,
      [PROPERTY_B,ORG]
    );

    await client.query(
      `INSERT INTO analytics_property_daily_rollups(
         organization_id,property_id,local_date,currency,
         available_unit_nights,occupied_unit_nights,booking_count,
         accommodation_revenue_minor,gross_revenue_minor,net_revenue_minor,
         occupancy,adr_minor,revpar_minor,avg_lead_time_days,avg_stay_nights,refreshed_at
       ) VALUES
       ($1,$2,$4::date,'UZS',10,5,3,5000,5500,5000,0.5,1000,500,10,2,'2034-07-16T00:00:00Z'),
       ($1,$3,$4::date,'UZS',20,10,5,15000,16000,15000,0.5,1500,750,20,3,'2034-07-16T00:00:00Z'),
       ($1,$2,$4::date,'USD',10,2,1,2000,2200,2000,0.2,1000,200,5,2,'2034-07-16T00:00:00Z')
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
      [ORG,PROPERTY_A,PROPERTY_B,DATE]
    );

    await client.query(
      "DELETE FROM analytics_dashboard_cache WHERE organization_id=$1 AND from_date=$2::date AND to_date=$2::date",
      [ORG,DATE]
    );
  });
});

describe.sequential("Stage 6 dashboard cache",()=>{
  it("aggregates portfolio metrics per currency and reuses an unchanged manager cache",async()=>{
    const first=await dashboards.summary(
      MANAGER,{type:"organization"},DATE,DATE
    );

    expect(first.cache.hit).toBe(false);
    expect(first.scope.accessiblePropertyCount).toBeGreaterThanOrEqual(2);

    const uzs=first.currencies.find(x=>x.currency==="UZS");
    const usd=first.currencies.find(x=>x.currency==="USD");
    if(!uzs||!usd)throw new Error("EXPECTED_DASHBOARD_CURRENCIES");

    expect(uzs.hospitality.availableUnitNights).toBe(30);
    expect(uzs.hospitality.occupiedUnitNights).toBe(15);
    expect(uzs.hospitality.accommodationRevenueMinor).toBe("20000");
    expect(uzs.hospitality.grossRevenueMinor).toBe("21500");
    expect(uzs.hospitality.netRevenueMinor).toBe("20000");
    expect(uzs.hospitality.occupancy).toBe(0.5);
    expect(uzs.hospitality.adrMinor).toBe("1333.33");
    expect(uzs.hospitality.revparMinor).toBe("666.67");

    expect(usd.hospitality.availableUnitNights).toBe(10);
    expect(usd.hospitality.occupiedUnitNights).toBe(2);
    expect(usd.hospitality.accommodationRevenueMinor).toBe("2000");
    expect(first.currencies).toHaveLength(2);

    const second=await dashboards.summary(
      MANAGER,{type:"organization"},DATE,DATE
    );
    expect(second.cache.hit).toBe(true);
    expect(second.freshness.etag).toBe(first.freshness.etag);
  });

  it("does not let a scoped host reuse or read a manager portfolio cache",async()=>{
    const host=await dashboards.summary(
      HOST,{type:"organization"},DATE,DATE
    );

    expect(host.cache.hit).toBe(false);
    expect(host.scope.accessiblePropertyCount).toBe(1);

    const uzs=host.currencies.find(x=>x.currency==="UZS");
    const usd=host.currencies.find(x=>x.currency==="USD");
    if(!uzs||!usd)throw new Error("EXPECTED_HOST_CURRENCIES");

    expect(uzs.hospitality.availableUnitNights).toBe(10);
    expect(uzs.hospitality.occupiedUnitNights).toBe(5);
    expect(uzs.hospitality.accommodationRevenueMinor).toBe("5000");
    expect(uzs.hospitality.adrMinor).toBe("1000.00");
    expect(usd.hospitality.availableUnitNights).toBe(10);

    const hostVisibleCache=await db.withActor(HOST,async client=>{
      return (await client.query<{scope_hash:string;property_ids:string[]}>(
        `SELECT scope_hash,property_ids
           FROM analytics_dashboard_cache
          WHERE organization_id=$1
            AND scope_key='organization'
            AND from_date=$2::date
            AND to_date=$2::date`,
        [ORG,DATE]
      )).rows;
    });

    expect(hostVisibleCache).toHaveLength(1);
    expect(hostVisibleCache[0].property_ids).toEqual([PROPERTY_A]);

    const managerCache=await db.withActor(MANAGER,async client=>{
      return (await client.query<{scope_hash:string}>(
        `SELECT scope_hash
           FROM analytics_dashboard_cache
          WHERE organization_id=$1
            AND scope_key='organization'
            AND from_date=$2::date
            AND to_date=$2::date`,
        [ORG,DATE]
      )).rows;
    });

    expect(new Set(managerCache.map(x=>x.scope_hash)).size).toBeGreaterThanOrEqual(2);
  });

  it("invalidates the cache when a materialized source changes",async()=>{
    const before=await dashboards.summary(
      MANAGER,{type:"organization"},DATE,DATE
    );
    expect(before.cache.hit).toBe(true);

    await db.withActor(MANAGER,async client=>{
      await client.query(
        `UPDATE analytics_property_daily_rollups
            SET accommodation_revenue_minor=6000,
                gross_revenue_minor=6500,
                net_revenue_minor=6000,
                adr_minor=1200,
                revpar_minor=600,
                refreshed_at='2034-07-16T00:01:00Z'
          WHERE organization_id=$1
            AND property_id=$2
            AND local_date=$3::date
            AND currency='UZS'`,
        [ORG,PROPERTY_A,DATE]
      );
    });

    const after=await dashboards.summary(
      MANAGER,{type:"organization"},DATE,DATE
    );

    expect(after.cache.hit).toBe(false);
    expect(after.freshness.sourceSignature).not.toBe(before.freshness.sourceSignature);

    const uzs=after.currencies.find(x=>x.currency==="UZS");
    if(!uzs)throw new Error("EXPECTED_UZS_AFTER_INVALIDATION");
    expect(uzs.hospitality.accommodationRevenueMinor).toBe("21000");
    expect(uzs.hospitality.grossRevenueMinor).toBe("22500");
    expect(uzs.hospitality.netRevenueMinor).toBe("21000");
    expect(uzs.hospitality.adrMinor).toBe("1400.00");
    expect(uzs.hospitality.revparMinor).toBe("700.00");
  });

  it("supports a property-scoped dashboard without leaking the portfolio",async()=>{
    const result=await dashboards.summary(
      MANAGER,{type:"property",propertyId:PROPERTY_B},DATE,DATE
    );

    expect(result.scope.type).toBe("property");
    expect(result.scope.propertyId).toBe(PROPERTY_B);
    expect(result.scope.accessiblePropertyCount).toBe(1);

    const uzs=result.currencies.find(x=>x.currency==="UZS");
    if(!uzs)throw new Error("EXPECTED_PROPERTY_UZS");
    expect(uzs.hospitality.availableUnitNights).toBe(20);
    expect(uzs.hospitality.occupiedUnitNights).toBe(10);
    expect(uzs.hospitality.accommodationRevenueMinor).toBe("15000");
    expect(result.currencies.some(x=>x.currency==="USD")).toBe(false);
  });
});

afterAll(async()=>{await db.onModuleDestroy()});
