import {Injectable} from "@nestjs/common";
import {DatabaseService} from "../database/database.service";
import type {RequestActorContext} from "../identity/actor-context";
export type AvailabilityInput={actor:RequestActorContext;unitId:string;checkInAt:string;checkOutAt:string};

@Injectable()
export class AvailabilityService{
 constructor(private readonly db:DatabaseService){}
 async isAvailable(input:AvailabilityInput){
  const start=new Date(input.checkInAt),end=new Date(input.checkOutAt);
  if(!Number.isFinite(start.getTime())||!Number.isFinite(end.getTime())||end<=start)throw new Error("INVALID_STAY_PERIOD");
  return this.db.withActor(input.actor,async client=>{
   const unit=await client.query<{property_id:string}>("SELECT property_id FROM units WHERE id=$1",[input.unitId]);
   if(!unit.rows[0])throw new Error("UNIT_NOT_FOUND");
   const access=await client.query<{allowed:boolean}>("SELECT app.can_access_property($1::uuid) AS allowed",[unit.rows[0].property_id]);
   if(!access.rows[0]?.allowed)throw new Error("PROPERTY_FORBIDDEN");
   const result=await client.query<{conflict:boolean}>("SELECT EXISTS(SELECT 1 FROM inventory_periods WHERE unit_id=$1 AND stay_period && tstzrange($2::timestamptz,$3::timestamptz,'[)') AND (expires_at IS NULL OR expires_at > now())) AS conflict",[input.unitId,input.checkInAt,input.checkOutAt]);
   return !result.rows[0].conflict;
  });
 }
}