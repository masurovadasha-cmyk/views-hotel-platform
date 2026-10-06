import {
  Body,Controller,Headers,HttpCode,Post,RawBodyRequest,Req
} from "@nestjs/common";
import {createHash,timingSafeEqual} from "node:crypto";
import type {Request} from "express";
import {loadConfig} from "../config";
import {resolveClientAddress} from "../security/client-identity";
import {networkAddressAllowed} from "../security/network-cidr";
import {
  PaymeMerchantApiService,
  paymeError,
  type PaymeRpcRequest
} from "./payme-merchant-api.service";
import {
  loadPaymeSandboxConfig,
  loadPaymeSourceCidrs
} from "./payme-sandbox.config";

@Controller("v1/payments/payme")
export class PaymeMerchantApiController{
  constructor(private readonly merchant:PaymeMerchantApiService){}

  @Post("merchant")
  @HttpCode(200)
  async merchantApi(
    @Req() request:RawBodyRequest<Request>,
    @Headers("authorization") authorization:string|undefined,
    @Body() body:unknown
  ){
    let raw:string;
    try{
      raw=rawBody(request,body);
    }catch{
      return paymeError(null,-32600);
    }

    let rpc:PaymeRpcRequest;
    let id:number|null=null;
    try{
      const parsed=JSON.parse(raw) as unknown;
      if(
        parsed&&typeof parsed==="object"&&!Array.isArray(parsed)&&
        Number.isSafeInteger((parsed as {id?:unknown}).id)
      ){
        id=(parsed as {id:number}).id;
      }
      rpc=parsed as PaymeRpcRequest;
    }catch{
      return paymeError(id,-32700);
    }

    if(!assertPaymeRequestIdentity(request,authorization)){
      return paymeError(id,-32504);
    }

    return this.merchant.handle(rpc,raw);
  }
}

export function assertPaymeRequestIdentity(
  request:{
    socket?:{remoteAddress?:string|null};
    headers?:Record<string,unknown>;
  },
  authorization:string|undefined,
  env:NodeJS.ProcessEnv=process.env
){
  const payme=loadPaymeSandboxConfig(env);
  if(!payme)return false;

  const config=loadConfig(env);
  let clientAddress:string;
  try{
    clientAddress=resolveClientAddress(
      {
        remoteAddress:request.socket?.remoteAddress??null,
        cfConnectingIp:singleHeader(
          request.headers?.["cf-connecting-ip"]
        )
      },
      config.trustedProxyMode,
      config.trustedProxyCidrs
    );
  }catch{
    return false;
  }

  if(!networkAddressAllowed(
    clientAddress,
    loadPaymeSourceCidrs(env)
  )){
    return false;
  }

  if(!authorization?.startsWith("Basic ")){
    return false;
  }

  let decoded:string;
  try{
    decoded=Buffer.from(
      authorization.slice("Basic ".length).trim(),
      "base64"
    ).toString("utf8");
  }catch{
    return false;
  }

  return safeEqual(decoded,payme.login+":"+payme.key);
}

function rawBody(
  request:RawBodyRequest<Request>,
  body:unknown
){
  if(request.rawBody?.length){
    if(request.rawBody.length>65536)throw new Error("PAYME_BODY_TOO_LARGE");
    return request.rawBody.toString("utf8");
  }
  if(Buffer.isBuffer(body)){
    if(body.length>65536)throw new Error("PAYME_BODY_TOO_LARGE");
    return body.toString("utf8");
  }
  const encoded=JSON.stringify(body??null);
  if(Buffer.byteLength(encoded)>65536)throw new Error("PAYME_BODY_TOO_LARGE");
  return encoded;
}

function safeEqual(left:string,right:string){
  const a=createHash("sha256").update(left).digest();
  const b=createHash("sha256").update(right).digest();
  return timingSafeEqual(a,b);
}

function singleHeader(value:unknown){
  if(Array.isArray(value)){
    return value.length===1&&typeof value[0]==="string"
      ?value[0]
      :null;
  }
  return typeof value==="string"?value:null;
}
