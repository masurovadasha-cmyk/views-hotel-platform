import {afterAll,beforeAll,describe,expect,it} from "vitest";
import {DatabaseService} from "../database/database.service";
import {AnalyticsQueryService} from "./analytics-query.service";

const ORG="00000000-0000-0000-0000-000000000001";
const TASHKENT_PROPERTY="00000000-0000-0000-0000-000000000002";
const SAMARKAND_PROPERTY="f3000000-0000-4000-8000-000000000001";
const MANAGER_USER="20000000-0000-4000-8000-000000000001";
const MANAGER_MEMBERSHIP="30000000-0000-4000-8000-000000000001";
const FRONT_DESK_USER="20000000-0000-4000-8000-000000000002";
const FRONT_DESK_MEMBERSHIP="30000000-0000-4000-8000-000000000002";
const DATE="2031-05-10";

const managerActor={
  organizationId:ORG,userId:MANAGER_USER,membershipId:MANAGER_MEMBERSHIP,
  requestId:"portfolio-rollups-manager"
};
const frontDeskActor={
  organizationId:ORG,userId:FRONT_DESK_USER,membershipId:FRONT_DESK_MEMBERSHIP,
  requestId:"portfolio-rollups-front-desk"
};

const db=new DatabaseService();
const queries=new AnalyticsQueryService(db);

beforeAll(async()=>{
  await db.withActor(managerActor,async client=>{
    await client.query(
      `INSERT INTO properties(
         id,organization_id,name,country_code,region_code,city,timezone,address,status
       ) VALUES(
         $1,$2,'{"en":"Samarkand Test Property"}'::jsonb,
         'UZ','SA','Samarkand','Asia/Samarkand','{}'::jsonb,'active'
       )
       ON CONFLICT(id) DO UPDATE SET
         country_code=EXCLUDED.country_code,
         region_code=EXCLUDED.region_code,
         city=EXCLUDED.city,
         timezone=EXCLUDED.timezone,
         status='active'`,
      [SAMARKAND_PROPERTY,ORG]
    );

    await client.query(
      `INSERT INTO analytics_property_daily_rollups(
         organization_id,property_id,local_date,currency,
         available_unit_nights,occupied_unit_nights,booking_count,
         accommodation_revenue_minor,gross_revenue_minor,net_revenue_minor,
         occupancy,adr_minor,revpar_minor,avg_lead_time_days,avg_stay_nights,refreshed_at
       ) VALUES
       ($1,$2,$4::date,'UZS',10,5,5,5000,6000,5500,0.5,1000,500,10,2,now()),
       ($1,$3,$4::date,'UZS',20,10,10,15000,17000,16000,0.5,1500,750,20,3,now())
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
      [ORG,TASHKENT_PROPERTY,SAMARKAND_PROPERTY,DATE]
    );
  });
});

describe.sequential("Stage 6 portfolio rollups",()=>{
  it("returns one weighted row per city from materialized property rollups",async()=>{
    const rows=await queries.cityDailyRollup(
      managerActor,DATE,DATE,"UZ"
    );

    const tashkent=rows.find(x=>x.city==="Tashkent");
    const samarkand=rows.find(x=>x.city==="Samarkand");
    if(!tashkent||!samarkand)throw new Error("EXPECTED_CITY_ROLLUPS");

    expect(tashkent.propertyCount).toBe(1);
    expect(tashkent.availableUnitNights).toBe(10);
    expect(tashkent.adrMinor).toBe("1000.00");
    expect(tashkent.revparMinor).toBe("500.00");

    expect(samarkand.propertyCount).toBe(1);
    expect(samarkand.availableUnitNights).toBe(20);
    expect(samarkand.adrMinor).toBe("1500.00");
    expect(samarkand.revparMinor).toBe("750.00");
  });

  it("recomputes weighted country KPIs from numerators and denominators",async()=>{
    const rows=await queries.countryDailyRollup(
      managerActor,DATE,DATE,"UZ"
    );
    expect(rows).toHaveLength(1);

    const uz=rows[0];
    expect(uz.propertyCount).toBe(2);
    expect(uz.availableUnitNights).toBe(30);
    expect(uz.occupiedUnitNights).toBe(15);
    expect(uz.bookingCount).toBe(15);
    expect(uz.accommodationRevenueMinor).toBe("20000");
    expect(uz.grossRevenueMinor).toBe("23000");
    expect(uz.netRevenueMinor).toBe("21500");
    expect(uz.occupancy).toBe(0.5);
    expect(uz.adrMinor).toBe("1333.33");
    expect(uz.revparMinor).toBe("666.67");
    expect(uz.avgLeadTimeDays).toBeCloseTo(16.67,2);
    expect(uz.avgStayNights).toBeCloseTo(2.67,2);
  });

  it("filters city portfolio reads",async()=>{
    const rows=await queries.cityDailyRollup(
      managerActor,DATE,DATE,"uz","samarkand"
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].city).toBe("Samarkand");
    expect(rows[0].propertyCount).toBe(1);
  });

  it("security-invoker portfolio views exclude properties outside membership scope",async()=>{
    const scoped=await db.withActor(frontDeskActor,async client=>{
      const country=(await client.query<{
        property_count:number;available_unit_nights:string;accommodation_revenue_minor:string;
      }>(
        `SELECT
           property_count,available_unit_nights::text,accommodation_revenue_minor::text
         FROM analytics_country_daily_rollups
        WHERE organization_id=$1 AND country_code='UZ'
          AND local_date=$2::date AND currency='UZS'`,
        [ORG,DATE]
      )).rows[0];

      const organization=(await client.query<{
        available_unit_nights:string;accommodation_revenue_minor:string;
      }>(
        `SELECT available_unit_nights::text,accommodation_revenue_minor::text
         FROM analytics_organization_daily_rollups
        WHERE organization_id=$1 AND local_date=$2::date AND currency='UZS'`,
        [ORG,DATE]
      )).rows[0];

      return {country,organization};
    });

    expect(scoped.country.property_count).toBe(1);
    expect(scoped.country.available_unit_nights).toBe("10");
    expect(scoped.country.accommodation_revenue_minor).toBe("5000");
    expect(scoped.organization.available_unit_nights).toBe("10");
    expect(scoped.organization.accommodation_revenue_minor).toBe("5000");
  });

  it("front desk remains forbidden from analytics API despite scoped SQL defense",async()=>{
    await expect(
      queries.countryDailyRollup(frontDeskActor,DATE,DATE,"UZ")
    ).rejects.toThrow("ANALYTICS_ROLE_FORBIDDEN");
  });
});

afterAll(async()=>{await db.onModuleDestroy()});
