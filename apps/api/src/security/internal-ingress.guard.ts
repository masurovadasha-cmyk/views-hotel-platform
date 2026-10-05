import {
  CanActivate,ExecutionContext,ForbiddenException,Injectable
} from "@nestjs/common";
import type {IncomingHttpHeaders} from "node:http";
import {loadConfig,type TrustedProxyMode} from "../config";
import {InternalAuthRejectionService} from "./internal-auth-rejection.service";
import {singleInternalHeader} from "./internal-service-identity";
import {networkAddressAllowed} from "./network-cidr";

const SERVICE_ID=/^[a-z0-9][a-z0-9._:-]{1,63}$/;
const INTERNAL_MARKERS=[
  "x-views-service-id",
  "x-views-service-token",
  "x-views-internal-key",
  "x-organization-id",
  "x-user-id",
  "x-membership-id"
] as const;

export class InternalIngressFailure extends ForbiddenException{
  constructor(readonly code:string){
    super("trusted service ingress denied");
  }
}

export type InternalIngressConfig={
  trustedProxyMode:TrustedProxyMode;
  trustedProxyCidrs:readonly string[];
  internalServiceSourceCidrs:Readonly<Record<string,readonly string[]>>;
};

@Injectable()
export class InternalIngressGuard implements CanActivate{
  constructor(private readonly rejections:InternalAuthRejectionService){}

  async canActivate(context:ExecutionContext){
    if(context.getType()!=="http")return true;

    const request=context.switchToHttp().getRequest<{
      headers:IncomingHttpHeaders;
      socket?:{remoteAddress?:string|null};
    }>();
    if(!hasInternalMarkers(request.headers))return true;

    const serviceId=singleInternalHeader(
      request.headers["x-views-service-id"]
    );
    if(!serviceId||!SERVICE_ID.test(serviceId)){
      return true;
    }

    try{
      const config=loadConfig();
      assertInternalServiceIngress({
        serviceId,
        remoteAddress:request.socket?.remoteAddress??null,
        cfConnectingIp:singleInternalHeader(
          request.headers["cf-connecting-ip"]
        ),
        config:{
          trustedProxyMode:config.trustedProxyMode,
          trustedProxyCidrs:config.trustedProxyCidrs,
          internalServiceSourceCidrs:config.internalServiceSourceCidrs
        }
      });
      return true;
    }catch(error){
      if(error instanceof InternalIngressFailure){
        await this.rejections.record(
          context,"service_ingress_denied"
        ).catch(()=>undefined);
      }
      throw error;
    }
  }
}

export function assertInternalServiceIngress(input:{
  serviceId:string;
  remoteAddress:string|null;
  cfConnectingIp:string|null;
  config:InternalIngressConfig;
}){
  const {serviceId,remoteAddress,cfConnectingIp,config}=input;

  if(config.trustedProxyMode==="direct"){
    const ranges=config.internalServiceSourceCidrs[serviceId];
    if(!ranges?.length){
      throw new InternalIngressFailure(
        "INTERNAL_SERVICE_INGRESS_NOT_CONFIGURED"
      );
    }
    if(!networkAddressAllowed(remoteAddress,ranges)){
      throw new InternalIngressFailure(
        "INTERNAL_SERVICE_SOURCE_NOT_ALLOWED"
      );
    }
    return;
  }

  if(!networkAddressAllowed(remoteAddress,config.trustedProxyCidrs)){
    throw new InternalIngressFailure("INTERNAL_PROXY_NOT_TRUSTED");
  }

  const serviceRanges=config.internalServiceSourceCidrs[serviceId];
  if(serviceRanges?.length&&
     !networkAddressAllowed(cfConnectingIp,serviceRanges)){
    throw new InternalIngressFailure(
      "INTERNAL_SERVICE_SOURCE_NOT_ALLOWED"
    );
  }
}

function hasInternalMarkers(headers:IncomingHttpHeaders){
  return INTERNAL_MARKERS.some(name=>headers[name]!==undefined);
}
