import {BadRequestException,Body,Controller,Get,Header,Headers,HttpCode,HttpException,Post,Req,UnauthorizedException} from '@nestjs/common';
import type {Request} from 'express';
import {loadConfig} from '../config';
import {clientNetworkKey} from '../security/client-identity';
import {RateLimitExceededError} from '../security/rate-limit.service';
import {GuestEmailService} from './guest-email.service';
function exact(raw:unknown,keys:string[]){
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).length!==keys.length||!keys.every(k=>Object.hasOwn(raw,k)))throw new BadRequestException('INVALID_GUEST_EMAIL_REQUEST');
 return raw as Record<string,unknown>;
}
function network(request:Request){const c=loadConfig(),ip=request.headers['cf-connecting-ip'];return clientNetworkKey({remoteAddress:request.socket.remoteAddress,cfConnectingIp:typeof ip==='string'?ip:null},c.trustedProxyMode,c.guestAuthRateLimitSecret,c.trustedProxyCidrs);}
function bearer(value:unknown){if(typeof value!=='string'||!value.startsWith('Bearer '))throw new UnauthorizedException('GUEST_EMAIL_SESSION_INVALID');return value.slice(7);}
async function limited<T>(fn:()=>Promise<T>){try{return await fn();}catch(e){if(e instanceof RateLimitExceededError)throw new HttpException({message:'RATE_LIMITED',retryAfterSeconds:e.retryAfterSeconds},429);throw e;}}
@Controller('v1/guest-identity/email')
export class GuestEmailController{
 constructor(private readonly auth:GuestEmailService){}
 @Post('request') @HttpCode(200) @Header('Cache-Control','no-store')
 request(@Body() raw:unknown,@Req() req:Request){const b=exact(raw,['email','locale']);return limited(()=>this.auth.requestLink(b.email,b.locale,network(req)));}
 @Post('exchange') @HttpCode(200) @Header('Cache-Control','no-store')
 exchange(@Body() raw:unknown,@Req() req:Request){const b=exact(raw,['challengeId','token']);return limited(()=>this.auth.exchange(b.challengeId,b.token,network(req)));}
 @Get('session') @Header('Cache-Control','no-store')
 session(@Headers('authorization') value:unknown){return this.auth.session(bearer(value));}
 @Post('logout') @HttpCode(200) @Header('Cache-Control','no-store')
 logout(@Body() raw:unknown,@Headers('authorization') value:unknown){exact(raw,[]);return this.auth.logout(bearer(value));}
}
