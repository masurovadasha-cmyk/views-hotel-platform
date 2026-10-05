import {afterAll,beforeAll,describe,expect,it} from "vitest";
import {DatabaseService} from "../database/database.service";
import {AnalyticsDashboardService} from "./analytics-dashboard.service";

const ORG="00000000-0000-0000-0000-000000000001";
const PROPERTY="00000000-0000-0000-0000-000000000002";
const UNIT="00000000-0000-0000-0000-000000000004";
const RATE="00000000-0000-0000-0000-000000000008";
const USER="20000000-0000-4000-8000-000000000001";
const MEMBERSHIP="30000000-0000-4000-8000-000000000001";

const ACTIVE_RESERVATION="f4000000-0000-4000-8000-000000000001";
const CANCELLED_RESERVATION="f4000000-0000-4000-8000-000000000002";
const ECONOMICS_SNAPSHOT="f5000000-0000-4000-8000-000000000001";
const DATE="2032-08-10";

const actor={
  organizationId:ORG,userId:USER,membershipId:MEMBERSHIP,requestId:"dashboard-read-model-test"
};

const db=new DatabaseService();
const dashboard=new AnalyticsDashboardService(db);

beforeAll(async()=>{
  await db.withActor(actor,async client=>{
    await client.query(
      `INSERT INTO reservations(
         id,organization_id,property_id,unit_id,rate_plan_id,confirmation_code,status,
         check_in_at,check_out_at,currency,accommodation_minor,total_minor,
         cancellation_policy_snapshot,quote_snapshot,confirmed_at,cancelled_at,
         created_at,updated_at,version
       ) VALUES
       (
         $1,$3,$4,$5,$6,'VW-DASH-ACTIVE','checked_out',
         '2032-08-10T14:00:00+05','2032-08-12T12:00:00+05',
         'UZS',10000,12000,'{}'::jsonb,
         '{"bookingChannel":"staff_crm","marketSegment":"corporate_sales"}'::jsonb,
         '2032-07-31T12:00:00+05',NULL,
         '2032-07-31T12:00:00+05','2032-08-12T12:00:00+05',2
       ),
       (
         $2,$3,$4,$5,$6,'VW-DASH-CANCELLED','cancelled',
         '2032-08-10T14:00:00+05','2032-08-12T12:00:00+05',
         'UZS',8000,9000,'{}'::jsonb,
         '{"bookingChannel":"staff_crm","marketSegment":"corporate_sales"}'::jsonb,
         '2032-07-30T12:00:00+05','2032-08-05T14:00:00+05',
         '2032-07-30T12:00:00+05','2032-08-05T14:00:00+05',2
       )
       ON CONFLICT(id) DO NOTHING`,
      [ACTIVE_RESERVATION,CANCELLED_RESERVATION,ORG,PROPERTY,UNIT,RATE]
    );

    await client.query(
      `INSERT INTO analytics_reservation_facts(
         reservation_id,organization_id,property_id,unit_id,status,currency,property_timezone,
         check_in_at,check_out_at,check_in_local_date,check_out_local_date,booking_local_date,
         stay_nights,booked_at,lead_time_days,accommodation_minor,gross_revenue_minor,
         source_version,source_updated_at,projected_at,
         booking_channel,market_segment,cancelled_at,no_show_at,cancellation_lead_days
       ) VALUES
       (
         $1,$3,$4,$5,'checked_out','UZS','Asia/Tashkent',
         '2032-08-10T14:00:00+05','2032-08-12T12:00:00+05',
         '2032-08-10','2032-08-12','2032-07-31',2,
         '2032-07-31T12:00:00+05',10,10000,12000,
         2,'2032-08-12T12:00:00+05',now(),
         'staff_crm','corporate_sales',NULL,NULL,NULL
       ),
       (
         $2,$3,$4,$5,'cancelled','UZS','Asia/Tashkent',
         '2032-08-10T14:00:00+05','2032-08-12T12:00:00+05',
         '2032-08-10','2032-08-12','2032-07-30',2,
         '2032-07-30T12:00:00+05',11,8000,9000,
         2,'2032-08-05T14:00:00+05',now(),
         'staff_crm','corporate_sales','2032-08-05T14:00:00+05',NULL,5
       )
       ON CONFLICT(reservation_id) DO UPDATE SET
         status=EXCLUDED.status,
         booking_channel=EXCLUDED.booking_channel,
         market_segment=EXCLUDED.market_segment,
         cancelled_at=EXCLUDED.cancelled_at,
         cancellation_lead_days=EXCLUDED.cancellation_lead_days,
         projected_at=now()`,
      [ACTIVE_RESERVATION,CANCELLED_RESERVATION,ORG,PROPERTY,UNIT]
    );

    await client.query(
      `INSERT INTO analytics_property_daily_rollups(
         organization_id,property_id,local_date,currency,
         available_unit_nights,occupied_unit_nights,booking_count,
         accommodation_revenue_minor,gross_revenue_minor,net_revenue_minor,
         occupancy,adr_minor,revpar_minor,avg_lead_time_days,avg_stay_nights,refreshed_at
       ) VALUES(
         $1,$2,$3::date,'UZS',
         10,1,1,5000,6000,5000,
         0.1,5000,500,10,2,now()
       )
       ON CONFLICT(organization_id,property_id,local_date,currency) DO UPDATE SET
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
         refreshed_at=now()`,
      [ORG,PROPERTY,DATE]
    );

    await client.query(
      `INSERT INTO reservation_economic_snapshots(
         id,organization_id,property_id,reservation_id,version,currency,
         net_collected_minor,platform_commission_minor,owner_payable_minor,
         taxes_withheld_minor,other_deductions_minor,status,source_kind,
         idempotency_key,request_hash,payment_state_hash,
         created_by_user_id,created_by_membership_id,
         finalized_by_user_id,finalized_by_membership_id,finalized_at
       ) VALUES(
         $1,$2,$3,$4,1,'UZS',
         10000,1000,8500,300,200,'finalized','manual',
         'dashboard-economics-v1',$5,$6,
         $7,$8,$7,$8,now()
       )
       ON CONFLICT(id) DO NOTHING`,
      [
        ECONOMICS_SNAPSHOT,ORG,PROPERTY,ACTIVE_RESERVATION,
        "a".repeat(64),"b".repeat(64),USER,MEMBERSHIP
      ]
    );

    await client.query(
      `INSERT INTO analytics_marketplace_economic_facts(
         reservation_id,organization_id,property_id,currency,source_kind,
         net_collected_minor,platform_commission_minor,owner_payable_minor,
         taxes_withheld_minor,other_deductions_minor,
         source_snapshot_id,source_version,source_finalized_at,projected_at
       ) VALUES(
         $1,$2,$3,'UZS','manual',
         10000,1000,8500,300,200,
         $4,1,now(),now()
       )
       ON CONFLICT(reservation_id) DO UPDATE SET
         net_collected_minor=EXCLUDED.net_collected_minor,
         platform_commission_minor=EXCLUDED.platform_commission_minor,
         owner_payable_minor=EXCLUDED.owner_payable_minor,
         taxes_withheld_minor=EXCLUDED.taxes_withheld_minor,
         other_deductions_minor=EXCLUDED.other_deductions_minor,
         projected_at=now()`,
      [ACTIVE_RESERVATION,ORG,PROPERTY,ECONOMICS_SNAPSHOT]
    );
  });
});

describe.sequential("Stage 6 dashboard read model",()=>{
  it("returns canonical KPI, lifecycle, marketplace and geography data",async()=>{
    const result=await dashboard.summary(actor,{
      from:DATE,to:DATE,propertyId:PROPERTY
    }) as any;

    expect(result.schemaVersion).toBe(1);
    expect(result.cache.hit).toBe(false);
    expect(result.scope).toEqual({organizationId:ORG,propertyId:PROPERTY});

    expect(result.kpisByCurrency).toHaveLength(1);
    expect(result.kpisByCurrency[0]).toMatchObject({
      currency:"UZS",
      propertyCount:1,
      availableUnitNights:10,
      occupiedUnitNights:1,
      bookingCount:1,
      accommodationRevenueMinor:"5000",
      grossRevenueMinor:"6000",
      netRevenueMinor:"5000",
      occupancy:0.1,
      adrMinor:"5000.00",
      revparMinor:"500.00"
    });

    expect(result.lifecycleByCurrency).toHaveLength(1);
    expect(result.lifecycleByCurrency[0]).toMatchObject({
      currency:"UZS",
      bookingCount:2,
      activeOrStayedCount:1,
      cancellationCount:1,
      noShowCount:0,
      cancellationRate:0.5
    });

    expect(result.marketplaceByCurrency).toHaveLength(1);
    expect(result.marketplaceByCurrency[0]).toMatchObject({
      currency:"UZS",
      reservationCount:1,
      netCollectedMinor:"10000",
      platformCommissionMinor:"1000",
      ownerPayableMinor:"8500",
      taxesWithheldMinor:"300",
      otherDeductionsMinor:"200",
      platformCommissionRate:0.1,
      ownerPayableRate:0.85
    });

    expect(result.geography).toHaveLength(1);
    expect(result.geography[0].city).toBe("Tashkent");
    expect(result.freshness.sourceFingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it("reuses a membership-scoped cache when source fingerprint is unchanged",async()=>{
    const first=await dashboard.summary(actor,{
      from:DATE,to:DATE,propertyId:PROPERTY
    }) as any;
    const second=await dashboard.summary(actor,{
      from:DATE,to:DATE,propertyId:PROPERTY
    }) as any;

    expect(second.cache.hit).toBe(true);
    expect(second.freshness.sourceFingerprint)
      .toBe(first.freshness.sourceFingerprint);

    const cacheRow=await db.withActor(actor,async client=>{
      return (await client.query<{
        membership_id:string;property_id:string|null;source_fingerprint:string;
      }>(
        `SELECT membership_id,property_id,source_fingerprint
           FROM analytics_dashboard_cache
          WHERE organization_id=$1
            AND membership_id=$2
            AND property_id=$3
            AND from_date=$4::date
            AND to_date=$4::date
          ORDER BY generated_at DESC
          LIMIT 1`,
        [ORG,MEMBERSHIP,PROPERTY,DATE]
      )).rows[0];
    });

    expect(cacheRow.membership_id).toBe(MEMBERSHIP);
    expect(cacheRow.property_id).toBe(PROPERTY);
    expect(cacheRow.source_fingerprint).toBe(second.freshness.sourceFingerprint);
  });

  it("invalidates cache when materialized rollup freshness changes",async()=>{
    const before=await dashboard.summary(actor,{
      from:DATE,to:DATE,propertyId:PROPERTY
    }) as any;

    await db.withActor(actor,async client=>{
      await client.query(
        `UPDATE analytics_property_daily_rollups
            SET accommodation_revenue_minor=7000,
                gross_revenue_minor=8000,
                net_revenue_minor=7000,
                refreshed_at=now()+interval '2 seconds'
          WHERE organization_id=$1
            AND property_id=$2
            AND local_date=$3::date
            AND currency='UZS'`,
        [ORG,PROPERTY,DATE]
      );
    });

    const after=await dashboard.summary(actor,{
      from:DATE,to:DATE,propertyId:PROPERTY
    }) as any;

    expect(after.cache.hit).toBe(false);
    expect(after.freshness.sourceFingerprint)
      .not.toBe(before.freshness.sourceFingerprint);
    expect(after.kpisByCurrency[0].accommodationRevenueMinor).toBe("7000");
    expect(after.kpisByCurrency[0].adrMinor).toBe("7000.00");
    expect(after.kpisByCurrency[0].revparMinor).toBe("700.00");
  });
});

afterAll(async()=>{await db.onModuleDestroy()});
