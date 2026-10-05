import {createHmac} from "node:crypto";
import {ExecutionContext,Injectable} from "@nestjs/common";
import type {IncomingHttpHeaders} from "node:http";
import {loadConfig} from "../config";
import {DatabaseService} from "../database/database.service";
import type {RequestActorContext} from "../identity/actor-context";
import {clientNetworkKey} from "./client-identity";
import {singleInternalHeader} from "./internal-service-identity";

export type InternalAuthRejectionReason=
  |"partial_actor_context"
  |"missing_internal_key"
  |"invalid_internal_key"
  |"missing_service_identity"
  |"invalid_service_identity"
  |"invalid_service_token"
  |"expired_service_token"
  |"service_token_replay"
  |"signed_token_required"
  |"service_ingress_denied";

@Injectable()
export class InternalAuthRejectionService{
  constructor(private readonly db:DatabaseService){}

  async record(
    context:ExecutionContext,
    reason:InternalAuthRejectionReason
  ){
    if(context.getType()!=="http")return null;

    const request=context.switchToHttp().getRequest<{
      headers:IncomingHttpHeaders;
      socket?:{remoteAddress?:string|null};
    }>();
    const config=loadConfig();
    const networkHash=this.networkHash(
      request.headers,
      request.socket?.remoteAddress??null,
      config.trustedProxyMode,
      config.guestAuthRateLimitSecret
    );
    const endpoint=(
      context.getClass().name+"."+context.getHandler().name
    ).slice(0,240);

    const row=(await this.db.query<{count:string}>(
      `SELECT app.record_internal_auth_rejection(
         $1,$2,$3,now()
       )::text AS count`,
      [reason,networkHash,endpoint]
    )).rows[0];

    return Number(row?.count??0);
  }

  async list(
    actor:RequestActorContext,
    hours=24,
    limit=100
  ){
    if(!Number.isInteger(hours)||hours<1||hours>24*90){
      throw new Error("INVALID_REJECTION_HOURS");
    }
    if(!Number.isInteger(limit)||limit<1||limit>500){
      throw new Error("INVALID_REJECTION_LIMIT");
    }

    return this.db.withActor(actor,async client=>{
      const role=(await client.query<{code:string|null}>(
        "SELECT app.current_membership_role() AS code"
      )).rows[0]?.code;
      if(role!=="platform_admin"){
        throw new Error("SECURITY_REJECTION_ROLE_FORBIDDEN");
      }

      const rows=await client.query<{
        bucket_start:Date;reason:InternalAuthRejectionReason;
        network_hash:string;endpoint:string;rejection_count:string;
        first_seen_at:Date;last_seen_at:Date;
      }>(
        `SELECT
           bucket_start,reason,network_hash,endpoint,
           rejection_count::text,first_seen_at,last_seen_at
         FROM internal_auth_rejection_counters
        WHERE bucket_start>=now()-make_interval(hours=>$1)
        ORDER BY last_seen_at DESC,bucket_start DESC
        LIMIT $2`,
        [hours,limit]
      );

      return rows.rows.map(row=>({
        bucketStart:row.bucket_start.toISOString(),
        reason:row.reason,
        networkFingerprint:row.network_hash.slice(0,16),
        endpoint:row.endpoint,
        rejectionCount:Number(row.rejection_count),
        firstSeenAt:row.first_seen_at.toISOString(),
        lastSeenAt:row.last_seen_at.toISOString()
      }));
    });
  }

  private networkHash(
    headers:IncomingHttpHeaders,
    remoteAddress:string|null,
    proxyMode:"direct"|"cloudflare",
    secret:string
  ){
    try{
      return clientNetworkKey({
        remoteAddress,
        cfConnectingIp:singleInternalHeader(headers["cf-connecting-ip"])
      },proxyMode,secret);
    }catch{
      return createHmac("sha256",secret)
        .update("network-unavailable")
        .digest("hex");
    }
  }
}
