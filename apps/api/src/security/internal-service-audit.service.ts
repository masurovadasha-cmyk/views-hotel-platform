import {Injectable} from "@nestjs/common";
import {DatabaseService} from "../database/database.service";
import type {RequestActorContext} from "../identity/actor-context";

export type InternalServiceAuditStart={
  organizationId:string|null;
  actorUserId:string|null;
  actorMembershipId:string|null;
  serviceId:string;
  keyFingerprint:string;
  requestId:string;
  httpMethod:string;
  routePath:string;
  authScheme:"internal_key"|"signed_token";
  tokenJti:string|null;
};

@Injectable()
export class InternalServiceAuditService{
  constructor(private readonly db:DatabaseService){}

  async begin(input:InternalServiceAuditStart){
    try{
      const row=(await this.db.query<{audit_id:string}>(
        `SELECT app.begin_internal_service_request_audit_v2(
           $1::uuid,$2::uuid,$3::uuid,$4,$5,$6,$7,$8,$9,$10::uuid
         ) AS audit_id`,
        [
          input.organizationId,input.actorUserId,input.actorMembershipId,
          input.serviceId,input.keyFingerprint,input.requestId,
          input.httpMethod,input.routePath,input.authScheme,input.tokenJti
        ]
      )).rows[0];
      if(!row?.audit_id)throw new Error("INTERNAL_AUDIT_BEGIN_FAILED");
      return row.audit_id;
    }catch(error){
      const pg=error as {code?:string;constraint?:string};
      if(
        pg?.code==="23505"&&
        pg.constraint==="internal_service_request_audit_token_replay_idx"
      ){
        throw new Error("INTERNAL_SERVICE_TOKEN_REPLAY");
      }
      throw error;
    }
  }

  async complete(
    auditId:string,
    statusCode:number,
    errorCode:string|null
  ){
    const row=(await this.db.query<{completed:boolean}>(
      `SELECT app.complete_internal_service_request_audit(
         $1::uuid,$2,$3,now()
       ) AS completed`,
      [auditId,statusCode,errorCode]
    )).rows[0];
    return row?.completed===true;
  }

  async list(
    actor:RequestActorContext,
    limit=100,
    serviceId?:string
  ){
    if(!Number.isInteger(limit)||limit<1||limit>200){
      throw new Error("INVALID_AUDIT_LIMIT");
    }
    const normalizedService=serviceId?.trim()||null;
    if(normalizedService&&
       !/^[a-z0-9][a-z0-9._:-]{1,63}$/.test(normalizedService)){
      throw new Error("INVALID_INTERNAL_SERVICE_ID");
    }

    return this.db.withActor(actor,async client=>{
      const role=(await client.query<{code:string|null}>(
        "SELECT app.current_membership_role() AS code"
      )).rows[0]?.code;
      if(!role||!["owner","manager","platform_admin"].includes(role)){
        throw new Error("SECURITY_AUDIT_ROLE_FORBIDDEN");
      }

      const rows=await client.query<{
        id:string;organization_id:string;actor_user_id:string|null;
        actor_membership_id:string|null;service_id:string;key_fingerprint:string;
        request_id:string;http_method:string;route_path:string;status_code:number|null;
        outcome:string;error_code:string|null;started_at:Date;completed_at:Date|null;
        duration_ms:number|null;auth_scheme:"internal_key"|"signed_token";
      }>(
        `SELECT
           id,organization_id,actor_user_id,actor_membership_id,
           service_id,key_fingerprint,request_id,http_method,route_path,
           status_code,outcome,error_code,started_at,completed_at,duration_ms,
           auth_scheme
         FROM internal_service_request_audit
        WHERE organization_id=$1
          AND ($2::text IS NULL OR service_id=$2)
        ORDER BY started_at DESC,id DESC
        LIMIT $3`,
        [actor.organizationId,normalizedService,limit]
      );

      return rows.rows.map(row=>({
        auditId:row.id,
        organizationId:row.organization_id,
        actorUserId:row.actor_user_id,
        actorMembershipId:row.actor_membership_id,
        serviceId:row.service_id,
        keyFingerprint:row.key_fingerprint,
        authScheme:row.auth_scheme,
        requestId:row.request_id,
        method:row.http_method,
        endpoint:row.route_path,
        statusCode:row.status_code,
        outcome:row.outcome,
        errorCode:row.error_code,
        startedAt:row.started_at.toISOString(),
        completedAt:row.completed_at?.toISOString()??null,
        durationMs:row.duration_ms
      }));
    });
  }
}
