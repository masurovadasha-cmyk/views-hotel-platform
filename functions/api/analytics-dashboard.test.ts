import {afterEach,describe,expect,it,vi} from "vitest";
import {onRequestGet} from "./analytics-dashboard";
import type {D1Database,D1Result,D1Statement,Env} from "./_shared";

function db(options:{linked?:boolean}={}):D1Database{
  return {
    prepare:(sql:string)=>{
      const statement={} as D1Statement;
      statement.bind=()=>statement;
      statement.first=async<T=Record<string,unknown>>()=>{
        if(sql.includes("FROM app_sessions")){
          return {
            id:"session-1",
            user_id:"staff-local-1",
            guest_id:null,
            role:"general_manager",
            organization_id:"views",
            property_ids:'["utower"]',
            expires_at:"2099-01-01T00:00:00.000Z"
          } as T;
        }
        if(sql.includes("core_identity_links")){
          if(options.linked===false)return null;
          return {
            core_organization_id:"00000000-0000-4000-8000-000000000001",
            core_user_id:"20000000-0000-4000-8000-000000000001",
            core_membership_id:"30000000-0000-4000-8000-000000000001"
          } as T;
        }
        if(sql.includes("core_property_links")){
          return {
            core_property_id:"00000000-0000-4000-8000-000000000002"
          } as T;
        }
        return null;
      };
      statement.all=async()=>({results:[]});
      statement.run=async()=>({meta:{changes:0}});
      return statement;
    },
    batch:async()=>[] as D1Result[]
  };
}

function env(linked=true):Env{
  return {
    DB:db({linked}),
    VIEWS_ENV:"staging",
    VIEWS_CORE_API_URL:"https://core.views.example",
    VIEWS_CORE_API_KEY:"fixture-core-internal-key-material-32chars"
  };
}

afterEach(()=>vi.unstubAllGlobals());

describe("analytics dashboard BFF",()=>{
  it("forwards verified Core actor context only on the server",async()=>{
    const fetchMock=vi.fn(async(_input:RequestInfo|URL,init?:RequestInit)=>{
      const headers=new Headers(init?.headers);
      expect(headers.get("x-views-internal-key"))
        .toBe("fixture-core-internal-key-material-32chars");
      expect(headers.get("x-views-service-id")).toBe("pages-bff");
      expect(headers.get("x-organization-id"))
        .toBe("00000000-0000-4000-8000-000000000001");
      expect(headers.get("x-user-id"))
        .toBe("20000000-0000-4000-8000-000000000001");
      expect(headers.get("x-membership-id"))
        .toBe("30000000-0000-4000-8000-000000000001");

      return new Response(JSON.stringify({
        schemaVersion:2,
        scope:{organizationId:"00000000-0000-4000-8000-000000000001",propertyId:null},
        period:{from:"2036-01-01",to:"2036-01-31"},
        kpisByCurrency:[]
      }),{
        status:200,
        headers:{"content-type":"application/json","etag":"\"views-dashboard-v1-fixture\""}
      });
    });
    vi.stubGlobal("fetch",fetchMock);

    const request=new Request(
      "https://staff.views.example/api/analytics-dashboard?from=2036-01-01&to=2036-01-31",
      {headers:{cookie:"views_session=session-1"}}
    );
    const response=await onRequestGet({request,env:env(true)});
    expect(response.status).toBe(200);
    expect(response.headers.get("etag")).toBe("\"views-dashboard-v1-fixture\"");

    const body=await response.json() as Record<string,unknown>;
    expect(body.schemaVersion).toBe(2);
    expect(JSON.stringify(body)).not.toContain("fixture-core-internal-key");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("fails closed when the D1 identity is not linked",async()=>{
    const fetchMock=vi.fn();
    vi.stubGlobal("fetch",fetchMock);

    const request=new Request(
      "https://staff.views.example/api/analytics-dashboard?from=2036-01-01&to=2036-01-31",
      {headers:{cookie:"views_session=session-1"}}
    );
    const response=await onRequestGet({request,env:env(false)});
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error:"CORE_IDENTITY_NOT_LINKED"
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps local property ids to Core UUIDs before forwarding",async()=>{
    let forwarded="";
    vi.stubGlobal("fetch",vi.fn(async(input:RequestInfo|URL)=>{
      forwarded=String(input);
      return Response.json({schemaVersion:2,kpisByCurrency:[]});
    }));

    const request=new Request(
      "https://staff.views.example/api/analytics-dashboard?from=2036-01-01&to=2036-01-31&propertyId=utower",
      {headers:{cookie:"views_session=session-1"}}
    );
    const response=await onRequestGet({request,env:env(true)});
    expect(response.status).toBe(200);
    expect(forwarded).toContain(
      "propertyId=00000000-0000-4000-8000-000000000002"
    );
    expect(forwarded).not.toContain("propertyId=utower");
  });

  it("prefers a signed service token and does not send the legacy API key",async()=>{
    const fetchMock=vi.fn(async(_input:RequestInfo|URL,init?:RequestInit)=>{
      const headers=new Headers(init?.headers);
      const token=headers.get("x-views-service-token");
      expect(token).toBeTruthy();
      expect(headers.get("x-views-internal-key")).toBeNull();
      expect(headers.get("x-views-service-id")).toBe("pages-bff");

      const parts=String(token).split(".");
      expect(parts).toHaveLength(3);
      const jwtHeader=decodeJwtJson(parts[0]);
      const claims=decodeJwtJson(parts[1]);
      expect(jwtHeader).toMatchObject({
        alg:"EdDSA",
        typ:"views-service+jwt",
        kid:"pages-2026-10"
      });
      expect(claims).toMatchObject({
        iss:"pages-bff",
        sub:"pages-bff",
        aud:"views-core",
        htm:"GET",
        htp:"/v1/analytics/dashboard/summary"
      });

      return Response.json({
        schemaVersion:2,
        scope:{organizationId:"00000000-0000-4000-8000-000000000001",propertyId:null},
        period:{from:"2036-01-01",to:"2036-01-31"},
        kpisByCurrency:[]
      });
    });
    vi.stubGlobal("fetch",fetchMock);

    const request=new Request(
      "https://staff.views.example/api/analytics-dashboard?from=2036-01-01&to=2036-01-31",
      {headers:{cookie:"views_session=session-1"}}
    );
    const signedEnv:Env={
      DB:db(),
      VIEWS_ENV:"staging",
      VIEWS_CORE_API_URL:"https://core.views.example",
      VIEWS_CORE_SIGNING_PRIVATE_KEY:await signingPrivatePem(),
      VIEWS_CORE_SIGNING_KID:"pages-2026-10"
    };

    const response=await onRequestGet({request,env:signedEnv});
    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

});


async function signingPrivatePem(){
  const pair=await crypto.subtle.generateKey(
    {name:"Ed25519"},
    true,
    ["sign","verify"]
  ) as CryptoKeyPair;
  const pkcs8=await crypto.subtle.exportKey("pkcs8",pair.privateKey);
  const bytes=new Uint8Array(pkcs8);
  let binary="";
  for(const byte of bytes)binary+=String.fromCharCode(byte);
  const base64=btoa(binary);
  const lines=base64.match(/.{1,64}/g)?.join("\n")||base64;
  return "-----BEGIN PRIVATE KEY-----\n"+lines+"\n-----END PRIVATE KEY-----";
}

function decodeJwtJson(segment:string){
  const padded=segment.replace(/-/g,"+").replace(/_/g,"/")+
    "=".repeat((4-segment.length%4)%4);
  const binary=atob(padded);
  const bytes=Uint8Array.from(binary,char=>char.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes)) as Record<string,unknown>;
}
