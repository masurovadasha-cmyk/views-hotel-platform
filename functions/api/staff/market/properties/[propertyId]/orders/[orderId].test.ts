import {beforeEach,describe,expect,it,vi} from "vitest";
import {onRequestGet} from "./[orderId]";
import {resolveSession} from "../../../../../_auth";
import {coreApiConfig,resolveCoreActor,resolveCoreProperty} from "../../../../../_core-bridge";
import {createCoreServiceToken} from "../../../../../_core-service-token";
vi.mock("../../../../../_auth",()=>({resolveSession:vi.fn()}));
vi.mock("../../../../../_core-bridge",()=>({
 resolveCoreActor:vi.fn(),resolveCoreProperty:vi.fn(),coreApiConfig:vi.fn(),
 CoreBridgeError:class CoreBridgeError extends Error{constructor(public code:string){super(code)}}
}));
vi.mock("../../../../../_core-service-token",()=>({createCoreServiceToken:vi.fn()}));
const P="00000000-0000-4000-8000-000000000001";
const O="00000000-0000-4000-8000-000000000002";
const session={mode:"staff",userId:"staff-1",role:"general_manager",organizationId:"views",propertyIds:["utower"]};
const env={DB:{} as never,VIEWS_ENV:"staging"};
const context=()=>({request:new Request("https://views.example/api/staff/market/properties/utower/orders/"+O),env,params:{propertyId:"utower",orderId:O}});
beforeEach(()=>{
 vi.resetAllMocks();
 vi.mocked(resolveSession).mockResolvedValue(session as never);
 vi.mocked(resolveCoreActor).mockResolvedValue({organizationId:P,userId:P,membershipId:P});
 vi.mocked(resolveCoreProperty).mockResolvedValue(P);
 vi.mocked(coreApiConfig).mockReturnValue({baseUrl:"https://core.views.example",internalKey:null,signingPrivateKey:"secret",signingKid:"kid"});
 vi.mocked(createCoreServiceToken).mockResolvedValue("signed-token");
});
describe("same-origin Staff CRM gateway",()=>{
 it("rejects unauthenticated browser requests without calling Core",async()=>{
  vi.mocked(resolveSession).mockResolvedValue(null);
  const fetcher=vi.fn();vi.stubGlobal("fetch",fetcher);
  const response=await onRequestGet(context());
  expect(response.status).toBe(401);expect(fetcher).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
 });
 it("rejects local property scope before linking actor or calling Core",async()=>{
  const fetcher=vi.fn();vi.stubGlobal("fetch",fetcher);
  const response=await onRequestGet({...context(),params:{propertyId:"nest-one",orderId:O}});
  expect(response.status).toBe(403);
  expect(resolveCoreActor).not.toHaveBeenCalled();
  expect(fetcher).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
 });
 it("signs server-side Core request and does not expose token in response",async()=>{
  const fetcher=vi.fn(async(_url:string,init:RequestInit)=>{
   expect(init.headers).toMatchObject({"x-views-service-token":"signed-token","x-views-service-id":"pages-bff"});
   return new Response(JSON.stringify({order:{id:O},lines:[],assignment:null,events:[]}),{status:200,headers:{"content-type":"application/json"}});
  });
  vi.stubGlobal("fetch",fetcher);
  const response=await onRequestGet(context());
  expect(response.status).toBe(200);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[0][0]).toBe("https://core.views.example/v1/internal/market/properties/"+P+"/orders/"+O);
  expect(await response.text()).not.toContain("signed-token");
  vi.unstubAllGlobals();
 });
 it("fails closed when signing credentials are missing",async()=>{
  vi.mocked(coreApiConfig).mockReturnValue({baseUrl:"https://core.views.example",internalKey:"legacy",signingPrivateKey:null,signingKid:null});
  const fetcher=vi.fn();vi.stubGlobal("fetch",fetcher);
  const response=await onRequestGet(context());
  expect(response.status).toBe(503);expect(fetcher).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
 });
});
