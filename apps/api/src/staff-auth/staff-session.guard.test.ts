import {describe,it,expect} from 'vitest';
import {StaffSessionGuard} from './staff-session.guard';
import {StaffAuthService,requireStaffPermission,type StaffIdentity} from './staff-auth.service';
const identity:StaffIdentity={organizationId:'74240000-0000-4000-8000-000000000001',userId:'74240000-0000-4000-8000-000000000003',
 membershipId:'74240000-0000-4000-8000-000000000004',email:'fixture@views.invalid',displayName:'Fixture',role:'front_desk',
 permissions:['reservation.read','reservation.manage'],propertyIds:[],expiresAt:new Date().toISOString(),credentialVersion:1,emailVerified:false};
function request(path='/v1/booking-workspace',method='GET',headers={}){return {method,originalUrl:path,headers:{'x-views-service-id':'local-workspace',
 'x-views-staff-session':'fixture-session','x-organization-id':identity.organizationId,'x-user-id':identity.userId,'x-membership-id':identity.membershipId,...headers}};}
function context(req:unknown){return {getType:()=> 'http',switchToHttp:()=>({getRequest:()=>req})} as never;}
describe('staff session enforcement on the trusted local gateway',()=>{
 it('requires DB resolved session for each business request',async()=>{
  let calls=0;const guard=new StaffSessionGuard({resolve:async()=>{calls++;return identity;}} as never);
  expect(await guard.canActivate(context(request()))).toBe(true);expect(await guard.canActivate(context(request('/v1/quotes','POST')))).toBe(true);expect(calls).toBe(2);
 });
 it('does not allow a static actor when session has been revoked',async()=>{
  const guard=new StaffSessionGuard({resolve:async()=>{throw Error('STAFF_SESSION_REQUIRED');}} as never);
  await expect(guard.canActivate(context(request()))).rejects.toThrow('STAFF_SESSION_REQUIRED');
 });
 it('rejects claimed actor different from resolved membership',async()=>{
  const guard=new StaffSessionGuard({resolve:async()=>identity} as never);
  await expect(guard.canActivate(context(request('/v1/booking-workspace','GET',{'x-user-id':'00000000-0000-4000-8000-000000000001'})))).rejects.toThrow('STAFF_ACTOR_MISMATCH');
 });
 it('a read-only permission set cannot create quotes or holds',async()=>{
  const guard=new StaffSessionGuard({resolve:async()=>({...identity,permissions:['reservation.read']})} as never);
  expect(await guard.canActivate(context(request()))).toBe(true);
  await expect(guard.canActivate(context(request('/v1/quotes','POST')))).rejects.toThrow('STAFF_PERMISSION_DENIED');
  await expect(guard.canActivate(context(request('/v1/bookings/holds','POST')))).rejects.toThrow('STAFF_PERMISSION_DENIED');
 });
 it('stay mutations require reservation.manage and a matching live actor',async()=>{
  const path='/v1/bookings/'+identity.userId+'/stay/document-view';
  const allowed=new StaffSessionGuard({resolve:async()=>identity} as never);
  expect(await allowed.canActivate(context(request(path,'POST')))).toBe(true);
  const reader=new StaffSessionGuard({resolve:async()=>({...identity,permissions:['reservation.read']})} as never);
  await expect(reader.canActivate(context(request(path,'POST')))).rejects.toThrow('STAFF_PERMISSION_DENIED');
  await expect(allowed.canActivate(context(request(path,'POST',{'x-membership-id':identity.userId})))).rejects.toThrow('STAFF_ACTOR_MISMATCH');
 });
 it('does not expand the local service into a payment or confirm client',async()=>{
  const guard=new StaffSessionGuard({resolve:async()=>identity} as never);
  for(const p of ['/v1/payments','/v1/bookings/'+identity.userId+'/confirm','/v1/internal/analytics/report-cycle'])
   await expect(guard.canActivate(context(request(p,'POST')))).rejects.toThrow('STAFF_ROUTE_DENIED');
 });
 it('default-off production boundary is not an implicit release',()=>{
  const old={...process.env};try{process.env.NODE_ENV='production';process.env.VIEWS_STAFF_AUTH_PILOT_ENABLED='true';process.env.VIEWS_LOCAL_REHEARSAL='true';
   expect(()=>new StaffAuthService({} as never).scope()).toThrow('STAFF_AUTH_NOT_ACTIVATED');
  }finally{for(const k of Object.keys(process.env))if(!(k in old))delete process.env[k];Object.assign(process.env,old);}
 });
 it('does not infer manage permission from a displayed role label',()=>{
  expect(()=>requireStaffPermission({...identity,role:'manager',permissions:[]},'reservation.manage')).toThrow('STAFF_PERMISSION_DENIED');
 });
});
