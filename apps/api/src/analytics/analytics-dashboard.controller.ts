import {
  BadRequestException,Controller,ForbiddenException,Get,Headers,Query,Res,UnauthorizedException
} from "@nestjs/common";
import type {Response} from "express";
import {loadConfig} from "../config";
import {requireUuid} from "../identity/actor-context";
import {trustedInternalServiceIdentity} from "../security/internal-service-identity";
import {dashboardEtag,matchesIfNoneMatch} from "./analytics-dashboard-http";
import {AnalyticsDashboardService} from "./analytics-dashboard.service";

@Controller("v1/analytics/dashboard")
export class AnalyticsDashboardController{
  constructor(private readonly dashboard:AnalyticsDashboardService){}

  @Get("summary")
  async summary(
    @Query("from") from:string|undefined,
    @Query("to") to:string|undefined,
    @Query("propertyId") propertyId:string|undefined,
    @Headers("if-none-match") ifNoneMatch:string|undefined,
    @Headers("x-views-internal-key") internalApiKey:string|undefined,
    @Headers("x-views-service-token") serviceToken:string|undefined,
    @Headers("x-views-service-id") serviceId:string|undefined,
    @Headers("x-organization-id") organizationId:string|undefined,
    @Headers("x-user-id") userId:string|undefined,
    @Headers("x-membership-id") membershipId:string|undefined,
    @Headers("x-request-id") requestId:string|undefined,
    @Res({passthrough:true}) response:Response
  ){
    try{
      const config=loadConfig();
      const identity=trustedInternalServiceIdentity(
        {
          "x-views-internal-key":internalApiKey,
          "x-views-service-token":serviceToken,
          "x-views-service-id":serviceId
        },
        {
          legacyKeys:config.internalApiKeys,
          serviceKeys:config.internalServiceKeys,
          servicePublicKeys:config.internalServicePublicKeys,
          serviceAuthModes:config.internalServiceAuthModes
        },
        {
          method:"GET",
          path:"/v1/analytics/dashboard/summary",
          requestId:requestId||""
        }
      );
      if(!identity)throw new Error("INTERNAL_API_UNAUTHORIZED");
      if(!from||!to)throw new BadRequestException("from and to are required");
      const result=await this.dashboard.summary(
        actorFromHeaders(organizationId,userId,membershipId,requestId),
        {
          from,to,
          propertyId:propertyId?requireUuid(propertyId,"property_id"):null
        }
      );

      const fingerprint=String(
        (result as {freshness?:{sourceFingerprint?:string}})
          .freshness?.sourceFingerprint??""
      );
      const etag=dashboardEtag(fingerprint);

      response.setHeader("ETag",etag);
      response.setHeader("Cache-Control","private, no-cache, must-revalidate");

      if(matchesIfNoneMatch(ifNoneMatch,etag)){
        response.status(304);
        return;
      }

      return result;
    }catch(error){throw mapDashboardError(error)}
  }
}

function actorFromHeaders(
  organizationId?:string,userId?:string,membershipId?:string,requestId?:string
){
  try{
    return {
      organizationId:requireUuid(organizationId,"organization_id"),
      userId:requireUuid(userId,"user_id"),
      membershipId:requireUuid(membershipId,"membership_id"),
      requestId:requestId||crypto.randomUUID()
    };
  }catch{throw new UnauthorizedException("valid actor context required")}
}

function mapDashboardError(error:unknown){
  if(
    error instanceof BadRequestException||
    error instanceof UnauthorizedException||
    error instanceof ForbiddenException
  )return error;

  const message=error instanceof Error?error.message:"ANALYTICS_DASHBOARD_ERROR";
  if(
    message==="INTERNAL_API_UNAUTHORIZED"||
    message==="INTERNAL_SERVICE_ID_REQUIRED"||
    message==="INTERNAL_SERVICE_NOT_CONFIGURED"||
    message==="INTERNAL_SERVICE_SIGNED_TOKEN_REQUIRED"||
    message.startsWith("INTERNAL_SERVICE_TOKEN_")
  ){
    return new UnauthorizedException("internal API authentication required");
  }
  if(message==="PROPERTY_FORBIDDEN"||message==="ANALYTICS_ROLE_FORBIDDEN"){
    return new ForbiddenException(message);
  }
  if(message.startsWith("INVALID_")||message==="ANALYTICS_RANGE_TOO_LARGE"){
    return new BadRequestException(message);
  }
  return new BadRequestException(message);
}
