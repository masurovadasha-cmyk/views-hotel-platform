import {randomUUID} from "node:crypto";
import {
  CallHandler,ExecutionContext,Injectable,NestInterceptor,UnauthorizedException
} from "@nestjs/common";
import type {IncomingHttpHeaders} from "node:http";
import {catchError,from,map,mergeMap,Observable,of,throwError} from "rxjs";
import {loadConfig} from "../config";
import {InternalServiceAuditService} from "./internal-service-audit.service";
import {
  singleInternalHeader,trustedInternalServiceIdentity
} from "./internal-service-identity";

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class InternalServiceAuditInterceptor implements NestInterceptor{
  constructor(private readonly audit:InternalServiceAuditService){}

  async intercept(
    context:ExecutionContext,
    next:CallHandler
  ):Promise<Observable<unknown>>{
    if(context.getType()!=="http")return next.handle();

    const http=context.switchToHttp();
    const request=http.getRequest<{
      headers:IncomingHttpHeaders;
      method:string;
    }>();
    const response=http.getResponse<{statusCode:number}>();

    let identity;
    try{
      identity=trustedInternalServiceIdentity(
        request.headers,
        loadConfig().internalApiKeys
      );
    }catch{
      throw new UnauthorizedException(
        "trusted internal service identity required"
      );
    }
    if(!identity)return next.handle();

    const actor=actorContext(request.headers);
    const requestId=normalizedRequestId(
      singleInternalHeader(request.headers["x-request-id"])
    );
    const endpoint=(
      context.getClass().name+"."+context.getHandler().name
    ).slice(0,240);
    const method=String(request.method||"GET").toUpperCase().slice(0,12);

    const auditId=await this.audit.begin({
      organizationId:actor.organizationId,
      actorUserId:actor.userId,
      actorMembershipId:actor.membershipId,
      serviceId:identity.serviceId,
      keyFingerprint:identity.keyFingerprint,
      requestId,
      httpMethod:method,
      routePath:endpoint
    });

    return next.handle().pipe(
      mergeMap(value=>from(
        this.audit.complete(
          auditId,
          normalizeStatus(response.statusCode,200),
          null
        )
      ).pipe(
        map(()=>value),
        catchError(()=>of(value))
      )),
      catchError(error=>{
        const status=errorStatus(error);
        const code=normalizedErrorCode(error,status);
        return from(
          this.audit.complete(auditId,status,code)
        ).pipe(
          catchError(()=>of(false)),
          mergeMap(()=>throwError(()=>error))
        );
      })
    );
  }
}

function actorContext(headers:IncomingHttpHeaders){
  const organizationId=validUuid(
    singleInternalHeader(headers["x-organization-id"])
  );
  const userId=validUuid(
    singleInternalHeader(headers["x-user-id"])
  );
  const membershipId=validUuid(
    singleInternalHeader(headers["x-membership-id"])
  );

  if(organizationId&&userId&&membershipId){
    return {organizationId,userId,membershipId};
  }
  return {
    organizationId:null,
    userId:null,
    membershipId:null
  };
}

function validUuid(value:string|null){
  return value&&UUID.test(value)?value:null;
}

function normalizedRequestId(value:string|null){
  if(value&&value.length<=160)return value;
  return "core:"+randomUUID();
}

function normalizeStatus(value:number|undefined,fallback:number){
  return Number.isInteger(value)&&value!>=100&&value!<=599
    ?value!
    :fallback;
}

function errorStatus(error:unknown){
  const candidate=error as {getStatus?:()=>number};
  if(typeof candidate?.getStatus==="function"){
    return normalizeStatus(candidate.getStatus(),500);
  }
  return 500;
}

function normalizedErrorCode(error:unknown,status:number){
  const message=error instanceof Error?error.message:"";
  if(/^[A-Z][A-Z0-9_:-]{1,119}$/.test(message))return message;
  return "HTTP_"+status;
}
