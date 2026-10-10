import {describe,it,expect,vi} from "vitest";
import {onRequestGet} from "./market-staff-orders";
import type {Env} from "./_shared";
vi.mock("./_auth",()=>({resolveSession:vi.fn()}));
vi.mock("./_core-bridge",async()=>{
 const actual=await vi.importActual<typeof import("./_core-bridge")>("./_core-bridge");
 return {...actual,resolveCoreActor:vi.fn(),resolveCoreProperty:vi.fn(),coreApiConfig:vi.fn()};
});
vi.mock("./_core-service-token",()=>({createCoreServiceToken:vi.fn()}));
import {resolveSession} from "./_auth";
import {resolveCoreActor,resolveCoreProperty,coreApiConfig} from "./_core-bridge";
import {createCoreServiceToken} from "./_core-service-token";
const session={mode:"staff",userId:"staff",role:"general_manager",organizationId:"views",propertyIds:["utower"]};
const env={} as Env;
const request=(query="propertyId=utower")=>new Request("https://views.example/api/market-staff-orders?"+query);
describe("Staff CRM market BFF",()=>{
 it("rejects anonymous requests without calling Core",async()=>{
  vi.mocked(resolveSession).mockResolvedValueOnce(null);
  const response=await onRequestGet({request:request(),env});
  expect(response.status).toBe(401);
 });
 it("rejects requests without a property",async()=>{
  vi.mocked(resolveSession).mockResolvedValueOnce(session as never);
  const response=await onRequestGet({request:request(""),env});
  expect(response.status).toBe(400);
 });
 it("rejects an invalid limit before contacting Core",async()=>{
  vi.mocked(resolveSession).mockResolvedValueOnce(session as never);
  vi.mocked(resolveCoreActor).mockResolvedValueOnce({organizationId:"org",userId:"user",membershipId:"member"});
  vi.mocked(resolveCoreProperty).mockResolvedValueOnce("00000000-0000-4000-8000-000000000002");
  vi.mocked(coreApiConfig).mockReturnValueOnce({baseUrl:"https://core.example",internalKey:"secret".repeat(8),signingPrivateKey:null,signingKid:null});
  const response=await onRequestGet({request:request("propertyId=utower&limit=101"),env});
  expect(response.status).toBe(400);
 });
 it("does not return service credentials to the browser",async()=>{
  vi.mocked(resolveSession).mockResolvedValueOnce(session as never);
  vi.mocked(resolveCoreActor).mockResolvedValueOnce({organizationId:"org",userId:"user",membershipId:"member"});
  vi.mocked(resolveCoreProperty).mockResolvedValueOnce("00000000-0000-4000-8000-000000000002");
  vi.mocked(coreApiConfig).mockReturnValueOnce({baseUrl:"https://core.example",internalKey:"secret".repeat(8),signingPrivateKey:null,signingKid:null});
  const fetchMock=vi.spyOn(globalThis,"fetch").mockResolvedValueOnce(new Response(JSON.stringify({orders:[{id:"order"}]}),{status:200,headers:{"Content-Type":"application/json"}}));
  try{
   const response=await onRequestGet({request:request(),env});
   expect(response.status).toBe(200);
   const body=await response.text();
   expect(body).not.toContain("secret");
   expect(fetchMock).toHaveBeenCalledTimes(1);
  }finally{fetchMock.mockRestore()}
 });
});
