import {CanActivate,ExecutionContext,Injectable,UnauthorizedException} from "@nestjs/common";
import type {IncomingHttpHeaders} from "node:http";
import {loadConfig} from "../config";
import {assertInternalApiKey} from "./internal-api-auth";

const actorHeaders=[
  "x-organization-id",
  "x-user-id",
  "x-membership-id"
] as const;

@Injectable()
export class InternalActorAuthGuard implements CanActivate{
  canActivate(context:ExecutionContext){
    if(context.getType()!=="http")return true;
    const request=context.switchToHttp().getRequest<{headers:IncomingHttpHeaders}>();
    assertTrustedInternalActorHeaders(
      request.headers,
      loadConfig().internalApiKeys
    );
    return true;
  }
}

export function assertTrustedInternalActorHeaders(
  headers:IncomingHttpHeaders,
  expectedInternalKey:string|readonly string[]
){
  const anyActorHeader=actorHeaders.some(name=>headers[name]!==undefined);
  if(!anyActorHeader)return;

  const organizationId=singleHeader(headers["x-organization-id"]);
  const userId=singleHeader(headers["x-user-id"]);
  const membershipId=singleHeader(headers["x-membership-id"]);

  if(!organizationId||!userId||!membershipId){
    throw new UnauthorizedException("complete internal actor context required");
  }

  const internalKey=singleHeader(headers["x-views-internal-key"]);
  try{
    assertInternalApiKey(internalKey??undefined,expectedInternalKey);
  }catch{
    throw new UnauthorizedException("internal API authentication required");
  }
}

function singleHeader(value:string|string[]|undefined){
  if(value===undefined)return null;
  if(Array.isArray(value)){
    if(value.length!==1)return null;
    const normalized=value[0].trim();
    return normalized||null;
  }
  const normalized=value.trim();
  return normalized||null;
}
