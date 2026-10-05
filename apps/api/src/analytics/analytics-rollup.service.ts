import {Injectable} from "@nestjs/common";
import {DatabaseService} from "../database/database.service";

@Injectable()
export class AnalyticsRollupService{
  constructor(private readonly db:DatabaseService){}

  async refreshOrganization(organizationId:string,propertyLimit=20){
    if(!Number.isInteger(propertyLimit)||propertyLimit<1||propertyLimit>100){
      throw new Error("INVALID_ANALYTICS_ROLLUP_LIMIT");
    }

    return this.db.withOrganization(organizationId,async client=>{
      const dirty=await client.query<{
        property_id:string;dirty_from:string;dirty_to:string;
      }>(
        `SELECT property_id,dirty_from::text,dirty_to::text
           FROM analytics_rollup_dirty_ranges
          WHERE organization_id=$1
          ORDER BY updated_at,property_id
          FOR UPDATE SKIP LOCKED
          LIMIT $2`,
        [organizationId,propertyLimit]
      );

      let refreshedRows=0;
      const properties:string[]=[];

      for(const range of dirty.rows){
        await client.query(
          `DELETE FROM analytics_property_daily_rollups
            WHERE organization_id=$1
              AND property_id=$2
              AND local_date BETWEEN $3::date AND $4::date`,
          [organizationId,range.property_id,range.dirty_from,range.dirty_to]
        );

        const inserted=await client.query(
          `INSERT INTO analytics_property_daily_rollups(
             organization_id,property_id,local_date,currency,
             available_unit_nights,occupied_unit_nights,booking_count,
             accommodation_revenue_minor,gross_revenue_minor,net_revenue_minor,
             occupancy,adr_minor,revpar_minor,avg_lead_time_days,avg_stay_nights,refreshed_at
           )
           SELECT
             v.organization_id,v.property_id,v.local_date,
             COALESCE(v.currency,o.default_currency),
             v.available_unit_nights,v.occupied_unit_nights,v.booking_count,
             v.accommodation_revenue_minor,v.gross_revenue_minor,v.net_revenue_minor,
             v.occupancy,v.adr_minor,v.revpar_minor,v.avg_lead_time_days,v.avg_stay_nights,now()
           FROM analytics_property_daily v
           JOIN organizations o ON o.id=v.organization_id
          WHERE v.organization_id=$1
            AND v.property_id=$2
            AND v.local_date BETWEEN $3::date AND $4::date
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
          [organizationId,range.property_id,range.dirty_from,range.dirty_to]
        );

        await client.query(
          `DELETE FROM analytics_rollup_dirty_ranges
            WHERE organization_id=$1
              AND property_id=$2
              AND dirty_from=$3::date
              AND dirty_to=$4::date`,
          [organizationId,range.property_id,range.dirty_from,range.dirty_to]
        );

        refreshedRows+=inserted.rowCount??0;
        properties.push(range.property_id);
      }

      return {
        refreshedProperties:properties.length,
        refreshedRows,
        properties
      };
    });
  }
}
