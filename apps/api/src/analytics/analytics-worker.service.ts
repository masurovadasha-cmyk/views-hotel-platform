import {randomUUID} from "node:crypto";
import {Injectable} from "@nestjs/common";
import {DatabaseService} from "../database/database.service";
import {AnalyticsProjectionService} from "./analytics-projection.service";
import {AnalyticsRollupService} from "./analytics-rollup.service";

const CONSUMER="analytics-core-v1";
const LEASE_SECONDS=300;

@Injectable()
export class AnalyticsWorkerService{
  constructor(
    private readonly db:DatabaseService,
    private readonly projector:AnalyticsProjectionService,
    private readonly rollups:AnalyticsRollupService
  ){}

  async runCycle(tenantLimit=20,eventLimit=200){
    if(!Number.isInteger(tenantLimit)||tenantLimit<1||tenantLimit>100){
      throw new Error("INVALID_ANALYTICS_TENANT_LIMIT");
    }
    if(!Number.isInteger(eventLimit)||eventLimit<1||eventLimit>500){
      throw new Error("INVALID_BATCH_LIMIT");
    }

    const workerToken="analytics-worker:"+randomUUID();
    const claimed=await this.db.query<{organization_id:string}>(
      "SELECT * FROM app.claim_analytics_projection_tenants($1,$2,$3,$4)",
      [CONSUMER,workerToken,tenantLimit,LEASE_SECONDS]
    );

    const results:Array<{
      organizationId:string;
      status:"completed"|"failed";
      scanned?:number;
      projected?:number;
      refreshedRollupProperties?:number;
      errorCode?:string;
    }>=[];

    for(const row of claimed.rows){
      try{
        const result=await this.projector.processOrganization(row.organization_id,eventLimit);
        const rollupResult=await this.rollups.refreshOrganization(row.organization_id,50);
        const completed=await this.complete(row.organization_id,workerToken,null);
        if(!completed)throw new Error("ANALYTICS_WORKER_LEASE_LOST");

        results.push({
          organizationId:row.organization_id,
          status:"completed",
          scanned:result.scanned,
          projected:result.projected,
          refreshedRollupProperties:rollupResult.refreshedProperties
        });
      }catch(error){
        const code=this.errorCode(error);
        await this.complete(row.organization_id,workerToken,code).catch(()=>false);
        results.push({
          organizationId:row.organization_id,
          status:"failed",
          errorCode:code
        });
      }
    }

    return {
      workerToken,
      claimedTenants:claimed.rowCount??0,
      completedTenants:results.filter(x=>x.status==="completed").length,
      failedTenants:results.filter(x=>x.status==="failed").length,
      results
    };
  }

  private async complete(organizationId:string,workerToken:string,errorCode:string|null){
    const row=await this.db.query<{completed:boolean}>(
      "SELECT app.complete_analytics_projection_tenant($1,$2,$3,$4) AS completed",
      [organizationId,CONSUMER,workerToken,errorCode]
    );
    return row.rows[0]?.completed===true;
  }

  private errorCode(error:unknown){
    const raw=error instanceof Error?error.message:"ANALYTICS_WORKER_ERROR";
    const normalized=raw.toUpperCase().replace(/[^A-Z0-9_:-]+/g,"_").slice(0,120);
    return normalized||"ANALYTICS_WORKER_ERROR";
  }
}
