import {describe,it,expect,vi,afterEach} from 'vitest';
import {Readable} from 'node:stream';
import {createHmac} from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{createLocalGateway}=require('../apps/api/ops/local-core-gateway.cjs'),project=require('../apps/api/ops/guest-link-projection.cjs');
const org='10000000-0000-4000-8000-000000000001',reservation='10000000-0000-4000-8000-000000000003',key='10000000-0000-4000-8000-000000000004';
const token='a'.repeat(64),internalKey='b'.repeat(64),csrf=createHmac('sha256',internalKey).update('staff-csrf:'+token).digest('hex');
async function call({body={email:'guest@views.invalid'},method='POST',headers={},permissions=['reservation.manage']}={}){
 const requests=[],fetchImpl=async(url,init)=>{requests.push({url,init});return Response.json(url.endsWith('/v1/staff-auth/session')?{organizationId:org,userId:org,membershipId:key,permissions,propertyIds:[key]}:{invitation:null});};
 const handler=createLocalGateway({configuration:{internalKey,fixture:{organizationId:org}},fetchImpl});
 const req=Readable.from(body===undefined?[]:[Buffer.from(JSON.stringify(body))]);req.url='/local-api/reservations/'+reservation+'/guest-link';req.method=method;
 req.headers={host:'127.0.0.1:4173',origin:'http://127.0.0.1:4173','x-views-local-workspace':'1','content-type':'application/json','x-csrf-token':csrf,'idempotency-key':key,cookie:'views_staff_session='+token,...headers};req.socket={remoteAddress:'127.0.0.1'};
 const result={};await handler(req,{writeHead:status=>{result.status=status;},end:b=>{result.body=JSON.parse(b);},setHeader:()=>{}});return {...result,requests};
}
afterEach(()=>vi.unstubAllEnvs());
describe('reservation invitation gateway',()=>{
 it('requires staff permission, csrf and exact body before forwarding',async()=>{
  vi.stubEnv('VIEWS_GUEST_LINK_PILOT_ENABLED','true');
  for(const args of [{headers:{'x-csrf-token':'forged'}},{permissions:[]},{body:{email:'guest@views.invalid',userId:org}}]){
   const r=await call(args);expect([400,403]).toContain(r.status);expect(r.requests.filter(r=>r.url.includes('/bookings/'))).toHaveLength(0);
  }
  const good=await call();expect(good.status).toBe(200);const req=good.requests.at(-1);expect(req.url).toBe('http://127.0.0.1:3001/v1/bookings/'+reservation+'/guest-link');expect(req.init.headers['idempotency-key']).toBe(key);expect(req.init.headers['x-views-staff-session']).toBe(token);
 });
 it('allows protected status refresh and keeps the pilot disabled by default',async()=>{
  vi.stubEnv('VIEWS_GUEST_LINK_PILOT_ENABLED','false');expect((await call()).status).toBe(404);
  vi.stubEnv('VIEWS_GUEST_LINK_PILOT_ENABLED','true');const r=await call({method:'GET',body:undefined});expect(r.status).toBe(200);expect(r.requests.at(-1).init.method).toBe('GET');
 });
 it('never forwards grant tokens or metadata in a guest preview',()=>{
  const b={reservationId:reservation,confirmationCode:'SYNTHETIC',checkInAt:'2037-01-01',checkOutAt:'2037-01-03',timezone:'Asia/Tashkent',propertyName:{en:'Property',secret:'hidden'},accepted:false,token:'private',recipientEmail:'private'};
  expect(project(b)).toEqual({reservationId:reservation,confirmationCode:'SYNTHETIC',checkInAt:b.checkInAt,checkOutAt:b.checkOutAt,timezone:b.timezone,propertyName:{en:'Property'},accepted:false});
 });
});
