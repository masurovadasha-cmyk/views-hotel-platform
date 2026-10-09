import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {onRequestGet} from "./[orderId]";
import {createCoreServiceToken} from "../../../../../_core-service-token";
import type {D1Database,D1Statement,Env} from "../../../../../_shared";

vi.mock("../../../../../_core-service-token",()=>({createCoreServiceToken:vi.fn()}));
const ORG="00000000-0000-4000-8000-000000000001";
const PROP="00000000-0000-4000-8000-000000000002";
const ORDER="00000000-0000-4000-8000-000000000003";
const USER="20000000-0000-4000-8000-000000000001";
const MEMBER="30000000-0000-4000-8000-000000000001";
const path="https://views.example/api/staff/market/properties/utower/orders/"+ORDER;
const validOrder={order:{id:ORDER,property_id:PROP,unit_id:null,status:"new",payment_status:"unpaid",total_minor:"0",subtotal_minor:"0",delivery_minor:"0",delivery_slot:"now",guest_comment:"",version:1,created_at:"2026-10-10T00:00:00Z",updated_at:"2026-10-10T00:00:00Z"},lines:[],assignment:null,events:[]};
function fixture(options:{identity?:boolean;property?:boolean;scope?:string[];role?:string}={}){
 const queried:string[]=[];
 const db:D1Database={
  prepare(sql:string){
   queried.push(sql);
   let args:unknown[]=[];
   const statement={
    bind(...values:unknown[]){args=values;return this},
    async first(){
     if(sql.includes("FROM app_sessions"))return {id:"session-1",user_id:"staff-1",guest_id:null,role:options.role??"general_manager",organization_id:"views",property_ids:JSON.stringify(options.scope??["utower"])};
     if(sql.includes("FROM core_identity_links")){
      if(args[0]!=="views"||args[1]!=="staff-1"||options.identity===false)return null;
      return {core_organization_id:ORG,core_user_id:USER,core_membership_id:MEMBER};
     }
     if(sql.includes("FROM core_property_links")){
      if(args[0]!=="views"||args[1]!=="utower"||options.property===false)return null;
      return {core_property_id:PROP};
     }
     throw Error("UNEXPECTED_DB_QUERY");
    },
    async all(){return {results:[]}},
    async run(){return {meta:{changes:0}}}
   } as D1Statement;
   return statement;
  },
  async batch(){return []}
 };
 const env:Env={DB:db,VIEWS_ENV:"staging",VIEWS_ALLOW_DEMO_HEADERS:"true",
  VIEWS_CORE_API_URL:"https://core.views.example",
  VIEWS_CORE_SIGNING_PRIVATE_KEY:"test-private-key",VIEWS_CORE_SIGNING_KID:"test-kid"};
 return {env,queried};
}
function invoke(env:Env,headers:Record<string,string>={cookie:"views_session=session-1"}){
 return onRequestGet({request:new Request(path,{headers}),env,params:{propertyId:"utower",orderId:ORDER}});
}
beforeEach(()=>{vi.resetAllMocks();vi.mocked(createCoreServiceToken).mockResolvedValue("test-signed-token")});
afterEach(()=>vi.unstubAllGlobals());
describe("Staff CRM session and D1 Core mapping boundary",()=>{
 it("maps an authorized cookie session through D1 to signed Core identifiers",async()=>{
  const {env,queried}=fixture();
  const fetcher=vi.fn(async(_url:string,init:RequestInit)=>{
   expect(init.headers).toMatchObject({"x-organization-id":ORG,"x-user-id":USER,"x-membership-id":MEMBER,"x-views-service-token":"test-signed-token"});
   return new Response(JSON.stringify(validOrder),{headers:{"content-type":"application/json"}});
  });
  vi.stubGlobal("fetch",fetcher);
  const result=await invoke(env);
  expect(result.status).toBe(200);
  expect((fetcher.mock.calls as unknown as [string,RequestInit][])[0][0]).toBe("https://core.views.example/v1/internal/market/properties/"+PROP+"/orders/"+ORDER);
  expect(queried).toHaveLength(3);
 });
 it("rejects an unlinked identity without signing or fetching Core",async()=>{
  const {env}=fixture({identity:false});
  const fetcher=vi.fn();vi.stubGlobal("fetch",fetcher);
  expect((await invoke(env)).status).toBe(503);
  expect(createCoreServiceToken).not.toHaveBeenCalled();
  expect(fetcher).not.toHaveBeenCalled();
 });
 it("rejects an unlinked property without fetching Core",async()=>{
  const {env}=fixture({property:false});
  const fetcher=vi.fn();vi.stubGlobal("fetch",fetcher);
  expect((await invoke(env)).status).toBe(503);
  expect(fetcher).not.toHaveBeenCalled();
 });
 it("rejects out-of-scope property before resolving Core links",async()=>{
  const {env,queried}=fixture({scope:["nest-one"]});
  const fetcher=vi.fn();vi.stubGlobal("fetch",fetcher);
  expect((await invoke(env)).status).toBe(403);
  expect(queried).toHaveLength(1);
  expect(fetcher).not.toHaveBeenCalled();
 });
 it("rejects guest or non-operational role before Core linking",async()=>{
  const {env,queried}=fixture({role:"cleaner"});
  const fetcher=vi.fn();vi.stubGlobal("fetch",fetcher);
  expect((await invoke(env)).status).toBe(403);
  expect(queried).toHaveLength(1);
  expect(fetcher).not.toHaveBeenCalled();
 });
});
