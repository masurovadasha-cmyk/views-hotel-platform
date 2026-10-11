import {Injectable} from "@nestjs/common";
import {DatabaseService} from "../../database/database.service";
import type {EgressAudit,EgressAuditSink} from "./provider-egress-client";

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class ProviderEgressAuditStore{
  constructor(private readonly db:DatabaseService){}

  forOrganization(organizationId:string):EgressAuditSink{
    if(!UUID.test(organizationId)){
      throw new Error("PROVIDER_EGRESS_ORGANIZATION_INVALID");
    }
    return Object.freeze({
      write:(event:EgressAudit)=>this.write(organizationId,event)
    });
  }

  private async write(
    organizationId:string,
    event:EgressAudit
  ):Promise<void>{
    await this.db.withOrganization(organizationId,async client=>{
      if(event.event==="started"){
        const row=(await client.query<{attempt_id:string}>(
          "SELECT app.begin_provider_egress_attempt($1,$2,$3::uuid,$4) AS attempt_id",
          [event.providerId,event.operationId,event.requestId,event.deadlineMs]
        )).rows[0];
        if(!row?.attempt_id){
          throw new Error("PROVIDER_EGRESS_AUDIT_BEGIN_FAILED");
        }
        return;
      }

      const row=(await client.query<{completed:boolean}>(
        "SELECT app.complete_provider_egress_attempt($1,$2,$3::uuid,$4,$5,$6,$7,$8) AS completed",
        [
          event.providerId,event.operationId,event.requestId,
          event.event,event.delivery,event.status??null,
          event.code??null,event.elapsedMs
        ]
      )).rows[0];

      if(row?.completed!==true){
        throw new Error("PROVIDER_EGRESS_AUDIT_STATE_CONFLICT");
      }
    });
  }
}
