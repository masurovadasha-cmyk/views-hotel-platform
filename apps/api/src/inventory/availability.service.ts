import {Injectable} from "@nestjs/common";
import {DatabaseService} from "../database/database.service";

export type AvailabilityInput={organizationId:string;unitId:string;checkInAt:string;checkOutAt:string};

@Injectable()
export class AvailabilityService{
  constructor(private readonly db:DatabaseService){}

  async isAvailable(input:AvailabilityInput){
    const start=new Date(input.checkInAt),end=new Date(input.checkOutAt);
    if(!Number.isFinite(start.getTime())||!Number.isFinite(end.getTime())||end<=start)throw new Error("INVALID_STAY_PERIOD");
    return this.db.withTenant(input.organizationId,async client=>{
      const result=await client.query<{conflict:boolean}>(`
        SELECT EXISTS(
          SELECT 1 FROM inventory_periods
          WHERE unit_id=$1
            AND stay_period && tstzrange($2::timestamptz,$3::timestamptz,'[)')
            AND (expires_at IS NULL OR expires_at > now())
        ) AS conflict
      `,[input.unitId,input.checkInAt,input.checkOutAt]);
      return !result.rows[0].conflict;
    });
  }
}
