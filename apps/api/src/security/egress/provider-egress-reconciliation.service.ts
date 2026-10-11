import {randomUUID} from "node:crypto";
import {Injectable} from "@nestjs/common";
import {DatabaseService} from "../../database/database.service";

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CODE=/^[A-Z][A-Z0-9_:-]{0,119}$/;

export type ProviderEgressReconciliationJob=Readonly<{
  queueId:string;
  attemptId:string;
  providerId:string;
  operationId:string;
  requestId:string;
  reason:"unknown_delivery"|"stale_started";
  attemptCount:number;
  startedAt:string;
  completedAt:string|null;
}>;

@Injectable()
export class ProviderEgressReconciliationService{
  constructor(private readonly db:DatabaseService){}

  async claimTenantBatch(
    organizationId:string,
    limit=20
  ):Promise<{workerId:string;jobs:ProviderEgressReconciliationJob[]}>{
    this.validateOrganization(organizationId);
    if(!Number.isInteger(limit)||limit<1||limit>100){
      throw new Error("PROVIDER_EGRESS_RECONCILE_LIMIT_INVALID");
    }
    const workerId=randomUUID();
    const jobs=await this.db.withOrganization(organizationId,async client=>{
      const rows=await client.query<{
        queue_id:string;attempt_id:string;provider_id:string;operation_id:string;
        request_id:string;reason:"unknown_delivery"|"stale_started";
        attempt_count:number;started_at:Date;completed_at:Date|null;
      }>(
        "SELECT * FROM app.claim_provider_egress_reconciliation($1::uuid,$2)",
        [workerId,limit]
      );
      return rows.rows.map(row=>Object.freeze({
        queueId:row.queue_id,
        attemptId:row.attempt_id,
        providerId:row.provider_id,
        operationId:row.operation_id,
        requestId:row.request_id,
        reason:row.reason,
        attemptCount:row.attempt_count,
        startedAt:row.started_at.toISOString(),
        completedAt:row.completed_at?.toISOString()??null
      }));
    });
    return {workerId,jobs};
  }

  async resolve(
    organizationId:string,
    workerId:string,
    queueId:string,
    resolutionCode:string
  ){
    return this.finish(
      organizationId,workerId,queueId,true,resolutionCode,60
    );
  }

  async retry(
    organizationId:string,
    workerId:string,
    queueId:string,
    errorCode:string,
    retryAfterSeconds=60
  ){
    return this.finish(
      organizationId,workerId,queueId,false,errorCode,retryAfterSeconds
    );
  }

  private async finish(
    organizationId:string,
    workerId:string,
    queueId:string,
    resolved:boolean,
    code:string,
    retryAfterSeconds:number
  ){
    this.validateOrganization(organizationId);
    if(!UUID.test(workerId)||!UUID.test(queueId)){
      throw new Error("PROVIDER_EGRESS_RECONCILE_CONTEXT_INVALID");
    }
    if(!CODE.test(code)){
      throw new Error("PROVIDER_EGRESS_RECONCILE_CODE_INVALID");
    }
    if(
      !Number.isInteger(retryAfterSeconds)||
      retryAfterSeconds<1||
      retryAfterSeconds>3600
    ){
      throw new Error("PROVIDER_EGRESS_RECONCILE_DELAY_INVALID");
    }

    return this.db.withOrganization(organizationId,async client=>{
      const row=(await client.query<{status:string}>(
        "SELECT app.finish_provider_egress_reconciliation($1::uuid,$2::uuid,$3,$4,$5) AS status",
        [queueId,workerId,resolved,code,retryAfterSeconds]
      )).rows[0];
      if(!row?.status){
        throw new Error("PROVIDER_EGRESS_RECONCILE_FINISH_FAILED");
      }
      return row.status;
    });
  }

  private validateOrganization(organizationId:string){
    if(!UUID.test(organizationId)){
      throw new Error("PROVIDER_EGRESS_ORGANIZATION_INVALID");
    }
  }
}
