import {Injectable} from "@nestjs/common";
import {DatabaseService} from "../database/database.service";

type DeadlinePolicyConfig={
  reminderMinutesBeforeDue?:number[];
};

@Injectable()
export class RegistrationDeadlineService{
  constructor(private readonly db:DatabaseService){}

  async emitTenantAlerts(organizationId:string,limit=100,now=new Date()){
    if(!Number.isInteger(limit)||limit<1||limit>500)throw new Error("INVALID_REGISTRATION_ALERT_LIMIT");
    if(!Number.isFinite(now.getTime()))throw new Error("INVALID_ALERT_TIME");

    return this.db.withOrganization(organizationId,async client=>{
      const rows=await client.query<{
        id:string;reservation_id:string;property_id:string;status:string;due_at:Date;
        policy_snapshot:{config?:DeadlinePolicyConfig};
      }>(
        `SELECT id,reservation_id,property_id,status,due_at,policy_snapshot
           FROM guest_registration_cases
          WHERE organization_id=$1
            AND status NOT IN ('confirmed','cancelled')
            AND due_at<=($2::timestamptz+interval '3 hours')
          ORDER BY due_at
          LIMIT $3`,
        [organizationId,now.toISOString(),limit]
      );

      let emitted=0;
      for(const row of rows.rows){
        const configured=row.policy_snapshot?.config?.reminderMinutesBeforeDue;
        const thresholds=(configured?.length?configured:[120,30,0])
          .filter(x=>Number.isInteger(x)&&x>=0&&x<=10080)
          .sort((a,b)=>a-b);
        if(!thresholds.length)continue;

        const minutesLeft=(row.due_at.getTime()-now.getTime())/60000;
        const threshold=thresholds.find(x=>minutesLeft<=x);
        if(threshold===undefined)continue;

        const overdue=minutesLeft<=0;
        const eventType=overdue
          ?"compliance.registration_overdue"
          :"compliance.registration_due_soon";
        const key=[
          "compliance","registration-deadline",row.id,
          String(threshold),row.due_at.toISOString()
        ].join(":");

        const result=await client.query(
          `INSERT INTO outbox_events(
             id,organization_id,aggregate_type,aggregate_id,event_type,idempotency_key,payload
           )
           VALUES(gen_random_uuid(),$1,'guest_registration',$2,$3,$4,$5::jsonb)
           ON CONFLICT(idempotency_key) DO NOTHING
           RETURNING id`,
          [
            organizationId,row.id,eventType,key,
            JSON.stringify({
              registrationCaseId:row.id,reservationId:row.reservation_id,
              propertyId:row.property_id,status:row.status,
              dueAt:row.due_at.toISOString(),thresholdMinutes:threshold,
              minutesRemaining:Math.floor(minutesLeft)
            })
          ]
        );
        emitted+=result.rowCount??0;
      }

      return {scanned:rows.rowCount??0,emitted};
    });
  }
}
