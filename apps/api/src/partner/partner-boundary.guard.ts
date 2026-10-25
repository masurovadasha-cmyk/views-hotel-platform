import {CanActivate,ExecutionContext,Injectable,UnauthorizedException} from '@nestjs/common';
import {partnerEnabled} from './partner.service';
/** Independent partner authentication, never an internal/staff-guard bypass. */
@Injectable()
export class PartnerBoundaryGuard implements CanActivate{
 canActivate(context:ExecutionContext){partnerEnabled();const req=context.switchToHttp().getRequest();
  const forbidden=Object.keys(req.headers).some(k=>k==='authorization'||/^x-(organization|user|membership|property|actor)-id$/.test(k)||/^x-views-(internal|service|staff)/.test(k));
  if(forbidden||!['127.0.0.1','::ffff:127.0.0.1','::1'].includes(req.socket?.remoteAddress)||typeof req.headers['x-views-partner-session']!=='string'||! /^[a-f0-9]{64}$/.test(req.headers['x-views-partner-session']))throw new UnauthorizedException('PARTNER_SESSION_REQUIRED');
  return true;
 }
}
