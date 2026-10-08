import {afterEach,describe,it,expect,vi} from 'vitest';
import {createRequire} from 'node:module';
import {createHmac,randomUUID} from 'node:crypto';
import {Readable} from 'node:stream';
const {createLocalGateway}=createRequire(import.meta.url)('../apps/api/ops/local-core-gateway.cjs');
const org='74900000-0000-4000-8000-000000000010',property='74900000-0000-4000-8000-000000000011',member='74900000-0000-4000-8000-000000000001';
const token='1'.repeat(64),secret='synthetic-gateway-test-key-only-000000000000';
const csrf=createHmac('sha256',secret).update('staff-csrf:'+token).digest('hex');
async function call({route,role='front_desk',permissions=[],method='GET',body,flag=true,override={},scope=[property]}){
 vi.stubEnv('VIEWS_OWNER_INVENTORY_DRAFT_ENABLED',flag?'true':'');vi.stubEnv('VIEWS_OWNER_CALENDAR_ENABLED',flag?'true':'');vi.stubEnv('VIEWS_HOUSEKEEPING_PILOT_ENABLED',flag?'true':'');
 const calls=[],identity={organizationId:org,userId:member,membershipId:member,role,permissions,propertyIds:scope,expiresAt:new Date(Date.now()+60000).toISOString()};
 const gateway=createLocalGateway({configuration:{fixture:{organizationId:org,propertyId:property},internalKey:secret},fetchImpl:async(url,init)=>{calls.push({url,init});return new Response(JSON.stringify(url.endsWith('/v1/staff-auth/session')?identity:{ok:true}));}});
 const req=Readable.from(body===undefined?[]:[Buffer.from(JSON.stringify(body))]);req.method=method;req.url='/local-api/'+route;req.socket={remoteAddress:'127.0.0.1'};
 req.headers={host:'127.0.0.1:4173',origin:'http://127.0.0.1:4173','content-type':'application/json','x-views-local-workspace':'1','x-csrf-token':csrf,cookie:'views_staff_session='+token,'idempotency-key':randomUUID(),...override};
 const res={setHeader(){},writeHead(status){this.status=status;},end(value){this.value=JSON.parse(value);}};
 await gateway(req,res);return {res,calls};
}
afterEach(()=>vi.unstubAllEnvs());
describe('owner and housekeeping gateway boundaries',()=>{
 it('default-off gates forward no business requests',async()=>{
  for(const route of ['owner-inventory','owner-inventory/'+property,'owner-inventory/'+property+'/calendar?from=2027-01-01&to=2027-01-02','housekeeping']){const {res,calls}=await call({route,flag:false});expect(res.status).toBe(404);expect(calls).toHaveLength(1);}
 });
 it('front desk cannot use either role workspace',async()=>{
  for(const route of ['owner-inventory','owner-inventory/'+property,'owner-inventory/'+property+'/calendar?from=2027-01-01&to=2027-01-02','housekeeping']){const {res,calls}=await call({route,permissions:['reservation.manage']});expect(res.status).toBe(403);expect(calls).toHaveLength(1);}
 });
 it('owner requires both role and property permission, without adopting fixture scope',async()=>{
  const {res,calls}=await call({route:'owner-inventory',role:'owner',permissions:['property.manage'],scope:[]});expect(res.status).toBe(200);expect(calls[1].url).toBe('http://127.0.0.1:3001/v1/owner-inventory');expect(calls[1].init.headers['x-membership-id']).toBe(member);
  expect((await call({route:'owner-inventory',role:'owner'})).res.status).toBe(403);
 });
 it('forwards owner draft detail and edits with session actor and CSRF protection',async()=>{
  for(const method of ['GET','POST']){
   const {res,calls}=await call({route:'owner-inventory/'+property,role:'owner',permissions:['property.manage'],scope:[],method,body:method==='POST'?{revision:'fixture'}:undefined});
   expect(res.status).toBe(200);expect(calls[1].url).toBe('http://127.0.0.1:3001/v1/owner-inventory/'+property);expect(calls[1].init.headers['x-membership-id']).toBe(member);
   for(const override of [{'x-csrf-token':''},{'x-organization-id':org},{origin:'https://external.invalid'}]){
    const denied=await call({route:'owner-inventory/'+property,role:'owner',permissions:['property.manage'],method,override});expect(denied.res.status).toBeGreaterThanOrEqual(400);expect(denied.calls.filter(c=>!c.url.endsWith('/session'))).toHaveLength(0);
   }
  }
 });
 it('calendar query is bounded to from/to and mutations cannot smuggle query overrides',async()=>{
  const route='owner-inventory/'+property+'/calendar',settings={role:'owner',permissions:['property.manage']};
  const ok=await call({...settings,route:route+'?from=2027-01-01&to=2027-01-02'});expect(ok.res.status).toBe(200);expect(ok.calls[1].url).toContain('/calendar?from=2027-01-01&to=2027-01-02');
  const write=await call({...settings,route,method:'POST',body:{action:'unblock',periodId:member}});expect(write.res.status).toBe(200);expect(write.calls[1].init.headers['x-membership-id']).toBe(member);
  for(const suffix of ['?from=2027-01-01&to=2027-01-02&propertyId='+org,'?from=2027-01-01&from=2027-01-02&to=2027-01-03'])expect((await call({...settings,route:route+suffix})).res.status).toBe(400);
  expect((await call({...settings,route:route+'?from=2027-01-01&to=2027-01-02',method:'POST',body:{}})).res.status).toBe(400);
  expect((await call({...settings,route,method:'POST',body:{},override:{'x-csrf-token':''}})).res.status).toBe(403);
 });
 it('binds housekeeper mutations to the server-owned property and same idempotency key',async()=>{
  const {res,calls}=await call({route:'housekeeping',role:'housekeeper',permissions:['housekeeping.work'],method:'POST',body:{taskId:member,action:'claim'}});
  expect(res.status).toBe(200);expect(JSON.parse(calls[1].init.body)).toEqual({taskId:member,action:'claim',propertyId:property});expect(calls[1].init.headers['idempotency-key']).toMatch(/^[a-f0-9-]{36}$/);
  expect((await call({route:'housekeeping',role:'housekeeper',permissions:['housekeeping.work'],scope:[]})).res.status).toBe(403);
 });
 it('rejects forged property, actor header and missing CSRF before writes',async()=>{
  for(const patch of [{body:{taskId:member,action:'claim',propertyId:org}},{override:{'x-user-id':org}},{override:{'x-csrf-token':''}}]){
   const {res,calls}=await call({route:'housekeeping',role:'housekeeper',permissions:['housekeeping.work'],method:'POST',body:{taskId:member,action:'claim'},...patch});expect(res.status).toBeGreaterThanOrEqual(400);expect(calls.filter(c=>c.init.method==='POST')).toHaveLength(0);
  }
 });
});
