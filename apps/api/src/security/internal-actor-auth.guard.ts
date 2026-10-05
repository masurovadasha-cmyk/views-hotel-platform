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
  trustedInternalServiceIdentity
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
    const request=context.switchToHttp().getRequest<{headers:IncomingHttpHeaders}>();

    try{
      const config=loadConfig();
      assertTrustedInternalActorHeaders(
        request.headers,
        {
          legacyKeys:config.internalApiKeys,
          serviceKeys:config.internalServiceKeys
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
  expectedInternalKey:import("./internal-service-identity").InternalServiceExpectedKeys
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
  if(rawKey===undefined){
    throw new InternalActorAuthFailure(
      "missing_internal_key",
      "internal API authentication required"
    );
  }
  const internalKey=singleInternalHeader(rawKey);
  if(!internalKey){
    throw new InternalActorAuthFailure(
      "invalid_internal_key",
      "internal API authentication required"
    );
  }

  try{
    const identity=trustedInternalServiceIdentity(
      headers,
      expectedInternalKey
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
