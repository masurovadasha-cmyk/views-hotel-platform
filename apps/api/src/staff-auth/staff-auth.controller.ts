import {BadRequestException,Body,Controller,Get,Headers,HttpCode,Post,Req,UnauthorizedException} from '@nestjs/common';
import type {Request} from 'express';
import type {IncomingHttpHeaders} from 'node:http';
import {loadConfig} from '../config';
import {trustedInternalServiceIdentity} from '../security/internal-service-identity';
import {StaffMfaService} from './staff-mfa.service';
import {StaffAuthService} from './staff-auth.service';

function exact(body:unknown,keys:string[]):Record<string,unknown>{
  if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).length!==keys.length||!keys.every(k=>Object.hasOwn(body,k)))
    throw new BadRequestException('STAFF_REQUEST_INVALID');
  return body as Record<string,unknown>;
}
/** Trusted local gateway only. No open registration or invitation issuance API. */
@Controller('v1/staff-auth')
export class StaffAuthController{
  constructor(private readonly auth:StaffAuthService,private readonly mfa:StaffMfaService){}
  private authorize(request:Request){
    this.auth.scope();const c=loadConfig();let identity;
    try{identity=trustedInternalServiceIdentity(request.headers,{legacyKeys:c.internalApiKeys,serviceKeys:c.internalServiceKeys,
      servicePublicKeys:c.internalServicePublicKeys,serviceAuthModes:c.internalServiceAuthModes},
      {method:request.method,path:request.path,requestId:String(request.headers['x-request-id']||'')});}catch{}
    if(identity?.serviceId!=='local-workspace')throw new UnauthorizedException('STAFF_GATEWAY_REQUIRED');
    if(request.headers['x-organization-id']||request.headers['x-user-id']||request.headers['x-membership-id'])
      throw new BadRequestException('STAFF_ACTOR_OVERRIDE_DENIED');
  }
  @Post('login') @HttpCode(200)
  login(@Req() req:Request,@Body() body:unknown){
    this.authorize(req);const b=exact(body,['email','password']);
    return this.auth.login({email:b.email,password:b.password},req.socket.remoteAddress||'unknown');
  }
  @Post('activate') @HttpCode(200)
  activate(@Req() req:Request,@Body() body:unknown){
    this.authorize(req);const b=exact(body,['token','password']);
    return this.auth.accept({token:b.token,password:b.password},'invite',req.socket.remoteAddress||'unknown');
  }
  @Post('reset') @HttpCode(200)
  reset(@Req() req:Request,@Body() body:unknown){
    this.authorize(req);const b=exact(body,['token','password']);
    return this.auth.accept({token:b.token,password:b.password},'reset',req.socket.remoteAddress||'unknown');
  }
  @Get('session')
  session(@Req() req:Request,@Headers('x-views-staff-session') token:string|undefined){
    this.authorize(req);return this.auth.resolve(token);
  }
  @Post('logout') @HttpCode(200)
  logout(@Req() req:Request,@Headers('x-views-staff-session') token:string|undefined,@Body() body:unknown){
    this.authorize(req);const b=exact(body,['all']);if(typeof b.all!=='boolean')throw new BadRequestException('STAFF_REQUEST_INVALID');
    return this.auth.logout(token,b.all);
  }
  @Post('password') @HttpCode(200)
  password(@Req() req:Request,@Headers('x-views-staff-session') token:string|undefined,@Body() body:unknown){
    this.authorize(req);const b=exact(body,['currentPassword','password']);return this.auth.change(token,{currentPassword:b.currentPassword,password:b.password});
  }
  @Post('passkey/state') @HttpCode(200)
  passkeyState(@Req() req:Request,@Headers('x-views-staff-session') token:string,@Body() body:unknown){
    this.authorize(req);exact(body,[]);return this.mfa.state(token);
  }
  @Post('passkey/options') @HttpCode(200)
  passkeyOptions(@Req() req:Request,@Headers('x-views-staff-session') token:string,@Body() body:unknown){
    this.authorize(req);const b=exact(body,['purpose','password']);
    if(b.purpose!=='register'&&b.purpose!=='authenticate')throw new BadRequestException('STAFF_REQUEST_INVALID');
    return this.mfa.begin(token,b.purpose,b.password);
  }
  @Post('passkey/verify') @HttpCode(200)
  passkeyVerify(@Req() req:Request,@Headers('x-views-staff-session') token:string,@Body() body:unknown){
    this.authorize(req);const b=exact(body,['purpose','challengeId','response']);
    if(b.purpose!=='register'&&b.purpose!=='authenticate')throw new BadRequestException('STAFF_REQUEST_INVALID');
    return this.mfa.finish(token,b.purpose,b.challengeId,b.response);
  }

}
