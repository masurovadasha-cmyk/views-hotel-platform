import {CanActivate,ExecutionContext,ForbiddenException,Injectable,UnauthorizedException} from '@nestjs/common';
import type {Request} from 'express';
import {StaffAuthService,requireStaffPermission} from './staff-auth.service';

/** Local-workspace service can no longer bootstrap a static actor: every
 * business request needs an active DB-backed staff session matching the actor. */
@Injectable()
export class StaffSessionGuard implements CanActivate{
  constructor(private readonly auth:StaffAuthService){}
  async canActivate(context:ExecutionContext){
    if(context.getType()!=='http')return true;
    const req=context.switchToHttp().getRequest<Request>();
    if(req.headers['x-views-service-id']!=='local-workspace')return true;
    const path=new URL(req.originalUrl||req.url,'http://views.internal').pathname;
    if(path.startsWith('/v1/staff-auth/'))return true; // controller validates gateway key
    const serviceRoute=req.method==='GET'&&path==='/v1/service-orders'||req.method==='POST'&&/^\/v1\/service-orders\/[a-f0-9-]{36}\/actions$/i.test(path);
    const folioRoute=/^\/v1\/folios(?:\/properties|\/reservations\/[a-f0-9-]{36}(?:\/(?:charges|reversals))?)?$/i.test(path)||path==='/v1/night-audit';
    const supplyPermission=req.method==='GET'&&/^\/v1\/supply\/(properties|items|orders|stock|movements)$/.test(path)?'supply.read':req.method==='POST'&&/^\/v1\/supply\/(items|orders)$/.test(path)?'purchase.manage':req.method==='POST'&&(/^\/v1\/supply\/orders\/[a-f0-9-]{36}\/receive$/i.test(path)||['/v1/supply/stock/issue','/v1/supply/stocktake/preview','/v1/supply/stocktake/confirm'].includes(path))?'stock.manage':null;
    const permission=supplyPermission??(folioRoute&&req.method==='GET'?'reservation.read':folioRoute&&req.method==='POST'?'reservation.manage':req.method==='GET'&&/^\/v1\/bookings\/[a-f0-9-]{36}\/guest-link$/.test(path)?'reservation.manage':req.method==='GET'&&/^\/v1\/refund-reconciliation(?:\/[a-f0-9-]{36})?$/i.test(path)?'finance.read':
      req.method==='POST'&&/^\/v1\/refund-reconciliation\/[a-f0-9-]{36}\/reviews$/i.test(path)?'finance.manage':
      ['GET','POST'].includes(req.method)&&path==='/v1/housekeeping'?'housekeeping.work':
      ['GET','POST'].includes(req.method)&&(/^\/v1\/owner-inventory(?:\/[a-f0-9-]{36}(?:\/(?:calendar|rates(?:\/[a-f0-9-]{36})?))?)?$/i.test(path))?'property.manage':
      req.method==='GET'&&['/v1/booking-workspace','/v1/inventory-search'].includes(path)?'reservation.read':
      req.method==='POST'&&(/^\/v1\/bookings\/[a-f0-9-]{36}\/guest-link(?:\/revoke)?$/.test(path)||path==='/v1/quotes'||path==='/v1/bookings/holds'||/^\/v1\/bookings\/[a-f0-9-]{36}\/(release|cancel)$/.test(path)||/^\/v1\/bookings\/[a-f0-9-]{36}\/stay\/(check-in|check-out|guest|document-view|document-review|cleaning-complete)$/.test(path))?'reservation.manage':null);
    if(!permission&&!serviceRoute)throw new ForbiddenException('STAFF_ROUTE_DENIED');
    const identity=await this.auth.resolve(req.headers['x-views-staff-session']);
    for(const [header,key] of [['x-organization-id','organizationId'],['x-user-id','userId'],['x-membership-id','membershipId']] as const)
      if(req.headers[header]!==identity[key])throw new UnauthorizedException('STAFF_ACTOR_MISMATCH');
    requireStaffPermission(identity,serviceRoute?(identity.permissions.includes('reservation.manage')?'reservation.manage':'housekeeping.work'):permission!);
    return true;
  }
}
