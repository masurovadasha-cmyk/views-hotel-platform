import {Body,Controller,Headers,HttpCode,Post,RawBodyRequest,Req} from "@nestjs/common";
import {createHash,timingSafeEqual} from "node:crypto";
import type {Request} from "express";
import {loadConfig} from "../config";
import {resolveClientAddress} from "../security/client-identity";
import {networkAddressAllowed} from "../security/network-cidr";
import {PaymeMerchantApiService,paymeError,type PaymeRpcRequest} from "./payme-merchant-api.service";
import {loadPaymeSandboxConfig,loadPaymeSourceCidrs} from "./payme-sandbox.config";

@Controller("v1/payments/payme")
export class PaymeMerchantApiController{
  constructor(private readonly merchant:PaymeMerchantApiService){}
  @Post("merchant")
  @HttpCode(200)
  async merchantApi(@Req() request:RawBodyRequest<Request>,@Headers("authorization") authorization:string|undefined,@Body() body:unknown){
    let raw:string;
    try{
      if(request.rawBody!==undefined)raw=request.rawBody.toString("utf8");
      else if(Buffer.isBuffer(body))raw=body.toString("utf8");
      else return paymeError(null,-32600);
      if(Buffer.byteLength(raw)>65536)return paymeError(null,-32600);
    }catch{return paymeError(null,-32600);}
    let rpc:PaymeRpcRequest;
    try{rpc=JSON.parse(raw) as PaymeRpcRequest;}catch{return paymeError(null,-32700);}
    const id=rpc&&typeof rpc==="object"&&!Array.isArray(rpc)&&Number.isSafeInteger(rpc.id)?rpc.id:null;
    if(!assertPaymeRequestIdentity(request,authorization))return paymeError(id,-32504);
    return this.merchant.handle(rpc,raw);
  }
}
export function assertPaymeRequestIdentity(
  request:{socket?:{remoteAddress?:string|null};headers?:Record<string,unknown>},
  authorization:string|undefined,env:NodeJS.ProcessEnv=process.env
){
  try{
    const payme=loadPaymeSandboxConfig(env);
    if(!payme||typeof authorization!=="string"||authorization.length>2048)return false;
    const config=loadConfig(env);
    const rawIp=request.headers?.["cf-connecting-ip"];
    const client=resolveClientAddress({remoteAddress:request.socket?.remoteAddress??null,
      cfConnectingIp:typeof rawIp==="string"?rawIp:null},config.trustedProxyMode,config.trustedProxyCidrs);
    if(!networkAddressAllowed(client,loadPaymeSourceCidrs(env)))return false;
    const match=authorization.match(/^Basic ([A-Za-z0-9+/]+={0,2})$/i);
    if(!match)return false;
    const decoded=Buffer.from(match[1],"base64");
    if(decoded.toString("base64")!==match[1])return false;
    const expected=createHash("sha256").update(payme.login+":"+payme.key).digest();
    const actual=createHash("sha256").update(decoded).digest();
    return timingSafeEqual(actual,expected);
  }catch{return false;}
}
