import {CanActivate,ExecutionContext,Injectable,UnauthorizedException} from "@nestjs/common";
import type {IncomingHttpHeaders} from "node:http";
import {loadConfig} from "../config";
import {
  InternalAuthRejectionService,
  type InternalAuthRejectionReason
} from "./internal-auth-rejection.service";
import {
  classifyInternalServiceIdentityFailure,
  singleInternalHeader,
  trustedInternalServiceIdentity,
  type InternalServiceRequestMeta
} from "./internal-service-identity";

const actorHeaders=[
  "x-organization-id",
  "x-user-id",
  "x-membership-id"
] as const;

export class InternalActorAuthFailure extends UnauthorizedException{
  constructor(
    readonly reason:InternalAuthRejectionReason,
    message:string
  ){
    super(message);
  }
}

@Injectable()
export class InternalActorAuthGuard implements CanActivate{
  constructor(private readonly rejections:InternalAuthRejectionService){}

  async canActivate(context:ExecutionContext){
    if(context.getType()!=="http")return true;
    const request=context.switchToHttp().getRequest<{
      headers:IncomingHttpHeaders;
      method?:string;
      originalUrl?:string;
      url?:string;
    }>();

    try{
      const config=loadConfig();
      assertTrustedInternalActorHeaders(
        request.headers,
        {
          legacyKeys:config.internalApiKeys,
          serviceKeys:config.internalServiceKeys,
          servicePublicKeys:config.internalServicePublicKeys,
          serviceAuthModes:config.internalServiceAuthModes
        },
        {
          method:String(request.method||"GET"),
          path:requestPath(request),
          requestId:singleInternalHeader(request.headers["x-request-id"])||""
        }
      );
      return true;
    }catch(error){
      if(error instanceof InternalActorAuthFailure){
        await this.rejections.record(context,error.reason).catch(()=>undefined);
      }
      throw error;
    }
  }
}

export function assertTrustedInternalActorHeaders(
  headers:IncomingHttpHeaders,
  expectedInternalKey:import("./internal-service-identity").InternalServiceExpectedKeys,
  request?:InternalServiceRequestMeta
){
  const anyActorHeader=actorHeaders.some(name=>headers[name]!==undefined);
  if(!anyActorHeader)return;

  const organizationId=singleInternalHeader(headers["x-organization-id"]);
  const userId=singleInternalHeader(headers["x-user-id"]);
  const membershipId=singleInternalHeader(headers["x-membership-id"]);

  if(!organizationId||!userId||!membershipId){
    throw new InternalActorAuthFailure(
      "partial_actor_context",
      "complete internal actor context required"
    );
  }

  const rawKey=headers["x-views-internal-key"];
  const rawToken=headers["x-views-service-token"];
  if(rawKey===undefined&&rawToken===undefined){
    throw new InternalActorAuthFailure(
      "missing_internal_key",
      "internal API authentication required"
    );
  }
  if(rawToken===undefined&&rawKey!==undefined&&!singleInternalHeader(rawKey)){
    throw new InternalActorAuthFailure(
      "invalid_internal_key",
      "internal API authentication required"
    );
  }

  try{
    const identity=trustedInternalServiceIdentity(
      headers,
      expectedInternalKey,
      request
    );
    if(!identity){
      throw new Error("INTERNAL_API_UNAUTHORIZED");
    }
  }catch(error){
    const reason=classifyInternalServiceIdentityFailure(headers,error);
    throw new InternalActorAuthFailure(
      reason,
      reason==="missing_service_identity"||reason==="invalid_service_identity"
        ?"trusted internal service identity required"
        :"internal API authentication required"
    );
  }
}

function requestPath(request:{originalUrl?:string;url?:string}){
  const raw=request.originalUrl||request.url||"/";
  try{
    return new URL(raw,"http://views.internal").pathname;
  }catch{
    return "/";
  }
}
