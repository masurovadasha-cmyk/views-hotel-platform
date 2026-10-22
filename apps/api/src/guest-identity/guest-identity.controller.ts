import {BadRequestException,Body,Controller,Get,Header,Headers,HttpException,Post,Req,UnauthorizedException} from '@nestjs/common';
import type {Request} from 'express';
import {loadConfig} from '../config';
import {clientNetworkKey} from '../security/client-identity';
import {RateLimitExceededError} from '../security/rate-limit.service';
import {GuestIdentityService} from './guest-identity.service';
function object(raw:unknown,allowed:string[]){
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).some(key=>!allowed.includes(key)))throw new BadRequestException('INVALID_GUEST_IDENTITY');
 return raw as Record<string,unknown>;
}
function network(request:Request){const config=loadConfig(),header=request.headers['cf-connecting-ip'];return clientNetworkKey({remoteAddress:request.socket.remoteAddress,cfConnectingIp:typeof header==='string'?header:null},config.trustedProxyMode,config.guestAuthRateLimitSecret,config.trustedProxyCidrs);}
function bearer(value:unknown){if(typeof value!=='string'||!value.startsWith('Bearer '))throw new UnauthorizedException('GUEST_SESSION_INVALID');return value.slice(7);}
async function bounded<T>(work:()=>Promise<T>){try{return await work();}catch(error){if(error instanceof RateLimitExceededError)throw new HttpException({message:'RATE_LIMITED',retryAfterSeconds:error.retryAfterSeconds},429);throw error;}}
@Controller('v1/guest-identity')
export class GuestIdentityController{
 constructor(private readonly identity:GuestIdentityService){}
 @Post('sms') @Header('Cache-Control','no-store')
 request(@Body() raw:unknown,@Req() request:Request){const body=object(raw,['phone','locale']);return bounded(()=>this.identity.requestCode(body.phone,body.locale??'ru',network(request)));}
 @Post('verify') @Header('Cache-Control','no-store')
 verify(@Body() raw:unknown,@Req() request:Request){const body=object(raw,['challengeId','code']);return bounded(()=>this.identity.verifyCode(body.challengeId,body.code,network(request)));}
 @Get('session') @Header('Cache-Control','no-store')
 session(@Headers('authorization') authorization:unknown){return this.identity.session(bearer(authorization));}
 @Post('logout') @Header('Cache-Control','no-store')
 logout(@Headers('authorization') authorization:unknown){return this.identity.logout(bearer(authorization));}
}
