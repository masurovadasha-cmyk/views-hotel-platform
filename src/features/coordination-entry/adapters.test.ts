import {afterEach,describe,expect,it,vi} from 'vitest';
import {coordinationRequest,dispatchAdapter,parseDispatchWorkspace,parsePartnerSession,partnerAdapter} from './adapters';
const id='00000000-0000-4000-8000-000000000001';
const scope={organizationId:id,userId:id,membershipId:id,propertyId:id};
afterEach(()=>vi.unstubAllGlobals());
describe('coordination authenticated boundaries',()=>{
 it('requires a real distinct partner principal/grant scope and finite unexpired session',()=>{
 const raw={authenticated:true,synthetic:true,sessionScope:JSON.stringify([id,id]),csrf:'test-memory-only',expiresAt:new Date(Date.now()+60000).toISOString()};
 expect(parsePartnerSession(raw)?.scope).toBe(raw.sessionScope);expect(parsePartnerSession({authenticated:false})).toBeNull();
 for(const bad of [{...raw,synthetic:false},{...raw,sessionScope:'partner'},{...raw,sessionScope:JSON.stringify([id])},{...raw,csrf:''},{...raw,expiresAt:'2020-01-01T00:00:00Z'},{authenticated:true}])expect(()=>parsePartnerSession(bad)).toThrow();
 });
 it('derives staff scope only from validated current workspace and matching property',()=>{
 expect(parseDispatchWorkspace({recoveryScope:scope,property:{id},syntheticData:true,realPayments:false})).toEqual({scope:JSON.stringify([id,id,id]),propertyId:id});
 for(const bad of [{recoveryScope:scope,property:{id:'other'},syntheticData:true,realPayments:false},{recoveryScope:scope,property:{id},syntheticData:false,realPayments:false},{recoveryScope:{...scope,userId:'manager'},property:{id},syntheticData:true,realPayments:false}])expect(()=>parseDispatchWorkspace(bad)).toThrow();
 });
 it('separates partner cookie path/header from staff and sends exact key/body without credentials in body',async()=>{
 const fetch=vi.fn().mockResolvedValue({ok:true,json:async()=>({})});vi.stubGlobal('fetch',fetch);
 await partnerAdapter('memory-csrf').decide(id,{action:'accept',expectedRevision:1,termsVersion:1},id);
 let [url,options]=fetch.mock.calls[0];expect(url).toBe('/partner-api/assignments/'+id+'/decisions');expect(options.credentials).toBe('same-origin');expect(options.headers).toEqual({'X-Views-Partner-Pilot':'1','X-CSRF-Token':'memory-csrf','Idempotency-Key':id,'Content-Type':'application/json'});expect(JSON.parse(options.body)).toEqual({action:'accept',expectedRevision:1,termsVersion:1});
 await dispatchAdapter('staff-csrf').list(id,id);[url,options]=fetch.mock.calls[1];expect(url).toContain('/local-api/partner-dispatch?propertyId='+id);expect(options.headers).toEqual({'X-Views-Local-Workspace':'1','X-CSRF-Token':'staff-csrf'});
 });
 it('propagates definitive codes, invalidates only corresponding auth boundary on401',async()=>{
 const dispatch=vi.fn();vi.stubGlobal('window',{dispatchEvent:dispatch});vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:false,status:401,json:async()=>({error:'PARTNER_SESSION_REQUIRED'})}));
 await expect(coordinationRequest('session','partner')).rejects.toMatchObject({code:'PARTNER_SESSION_REQUIRED',status:401});expect(dispatch.mock.calls[0][0].type).toBe('views-partner-expired');
 });
});
