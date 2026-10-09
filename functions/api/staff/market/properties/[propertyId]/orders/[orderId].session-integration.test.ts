import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {onRequestGet} from "./[orderId]";
import {resolveCoreActor,resolveCoreProperty,coreApiConfig} from "../../../../../_core-bridge";
import {createCoreServiceToken} from "../../../../../_core-service-token";
import type {Env,D1Statement} from "../../../../../_shared";

vi.mock("../../../../../_core-bridge",()=>({
 resolveCoreActor:vi.fn(),resolveCoreProperty:vi.fn(),coreApiConfig:vi.fn(),
 CoreBridgeError:class CoreBridgeError extends Error{constructor(public code:string){super(code)}}
}));
vi.mock("../../../../../_core-service-token",()=>({createCoreServiceToken:vi.fn()}));

const P="00000000-0000-4000-8000-000000000001";
const O="00000000-0000-4000-8000-000000000002";
const path="https://views.example/api/staff/market/properties/utower/orders/"+O;
const order={order:{id:O,property_id:P,unit_id:null,status:"new",payment_status:"unpaid",total_minor:"0",subtotal_minor:"0",delivery_minor:"0",delivery_slot:"now",guest_comment:"",version:1,created_at:"2026-10-10T00:00:00Z",updated_at:"2026-10-10T00:00:00Z"},lines:[],assignment:null,events:[]};
function environment(sessionRow:Record<string,unknown>|null):Env{
 const statement={
  bind(){return this},
  async first(){return sessionRow},
  async all(){return {results:[]}},
  async run(){return {meta:{changes:0}}}
 } as D1Statement;
 return {VIEWS_ENV:"staging",VIEWS_ALLOW_DEMO_HEADERS:"true",DB:{
  prepare:()=>statement,batch:async()=>[]
 }};
}
function request(env:Env,headers:Record<string,string>={}){
 return onRequestGet({request:new Request(path,{headers}),env,params:{propertyId:"utower",orderId:O}});
}
const staffRow={id:"session-1",user_id:"staff-1",guest_id:null,role:"general_manager",organization_id:"views",property_ids:'["utower"]',expires_at:"2099-01-01T00:00:00Z"};
beforeEach(()=>{
 vi.resetAllMocks();
 vi.mocked(resolveCoreActor).mockResolvedValue({organizationId:P,userId:P,membershipId:P});
 vi.mocked(resolveCoreProperty).mockResolvedValue(P);
 vi.mocked(coreApiConfig).mockReturnValue({baseUrl:"https://core.views.example",internalKey:null,signingPrivateKey:"secret",signingKid:"kid"});
 vi.mocked(createCoreServiceToken).mockResolvedValue("signed-token");
});
afterEach(()=>vi.unstubAllGlobals());
describe("Staff gateway with real session resolver",()=>{
 it("denies demo headers even if staging allows them elsewhere",async()=>{
  const fetcher=vi.fn();vi.stubGlobal("fetch",fetcher);
  const response=await request(environment(null),{"x-views-demo-role":"general_manager"});
  expect(response.status).toBe(401);
  expect(fetcher).not.toHaveBeenCalled();
  expect(createCoreServiceToken).not.toHaveBeenCalled();
 });
 it("requires a real cookie-backed session before Core signing",async()=>{
  const fetcher=vi.fn();vi.stubGlobal("fetch",fetcher);
  const response=await request(environment(null));
  expect(response.status).toBe(401);
  expect(fetcher).not.toHaveBeenCalled();
 });
 it("denies a valid cookie session scoped to another property",async()=>{
  const fetcher=vi.fn();vi.stubGlobal("fetch",fetcher);
  const response=await request(environment({...staffRow,property_ids:'["nest-one"]'}),{cookie:"views_session=session-1"});
  expect(response.status).toBe(403);
  expect(resolveCoreActor).not.toHaveBeenCalled();
  expect(fetcher).not.toHaveBeenCalled();
 });
 it("denies guest cookie session",async()=>{
  const fetcher=vi.fn();vi.stubGlobal("fetch",fetcher);
  const response=await request(environment({...staffRow,guest_id:"guest-1"}),{cookie:"views_session=session-1"});
  expect(response.status).toBe(401);
  expect(fetcher).not.toHaveBeenCalled();
 });
 it("loads scoped order through signed Core request for cookie-backed staff",async()=>{
  const fetcher=vi.fn(async()=>new Response(JSON.stringify(order),{headers:{"content-type":"application/json"}}));
  vi.stubGlobal("fetch",fetcher);
  const response=await request(environment(staffRow),{cookie:"views_session=session-1"});
  expect(response.status).toBe(200);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(createCoreServiceToken).toHaveBeenCalledTimes(1);
  expect((await response.json() as {order:{id:string}}).order.id).toBe(O);
 });
});
