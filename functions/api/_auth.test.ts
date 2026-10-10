import {describe,expect,it} from "vitest";
import {requireMutationOrigin,resolveSession} from "./_auth";
import type {D1Database,D1Result,D1Statement,Env} from "./_shared";

function dbReturning(row:Record<string,unknown>|null):D1Database{
  const statement={} as D1Statement;
  statement.bind=()=>statement;
  statement.first=async<T=Record<string,unknown>>()=>row as T|null;
  statement.all=async()=>({results:row?[row]:[]});
  statement.run=async()=>({meta:{changes:0}});
  return {
    prepare:()=>statement,
    batch:async()=>[] as D1Result[]
  };
}

describe("resolveSession",()=>{
  it("resolves a cookie-backed staff session and normalizes property scopes",async()=>{
    const env:Env={DB:dbReturning({
      id:"session-1",
      user_id:"user-1",
      guest_id:null,
      role:"front_desk",
      organization_id:"views",
      property_ids:'["utower","utower","nest-one"]',
      expires_at:"2099-01-01T00:00:00.000Z"
    })};
    const request=new Request("https://staging.example/api/session",{headers:{cookie:"views_session=session-1"}});
    await expect(resolveSession(request,env)).resolves.toEqual({
      mode:"staff",
      userId:"user-1",
      role:"front_desk",
      organizationId:"views",
      propertyIds:["utower","nest-one"]
    });
  });

  it("fails closed on malformed stored property scope JSON",async()=>{
    const env:Env={DB:dbReturning({
      id:"session-1",
      user_id:"user-1",
      guest_id:null,
      role:"front_desk",
      organization_id:"views",
      property_ids:"not-json",
      expires_at:"2099-01-01T00:00:00.000Z"
    })};
    const request=new Request("https://staging.example/api/session",{headers:{cookie:"views_session=session-1"}});
    const session=await resolveSession(request,env);
    expect(session?.mode).toBe("staff");
    if(session?.mode==="staff")expect(session.propertyIds).toEqual([]);
  });

  it("does not trust demo headers unless explicitly enabled in staging",async()=>{
    const request=new Request("https://staging.example/api/session",{headers:{"x-views-demo-role":"super_admin"}});
    await expect(resolveSession(request,{VIEWS_ENV:"staging",VIEWS_ALLOW_DEMO_HEADERS:"false"})).resolves.toBeNull();
    await expect(resolveSession(request,{VIEWS_ENV:"production",VIEWS_ALLOW_DEMO_HEADERS:"true"})).resolves.toBeNull();
  });

  it("permits demo headers only behind the explicit staging switch",async()=>{
    const request=new Request("https://staging.example/api/session",{headers:{
      "x-views-demo-role":"front_desk",
      "x-views-user-id":"demo-front"
    }});
    await expect(resolveSession(request,{VIEWS_ENV:"staging",VIEWS_ALLOW_DEMO_HEADERS:"true"})).resolves.toEqual({
      mode:"staff",
      userId:"demo-front",
      role:"front_desk",
      organizationId:"views",
      propertyIds:["utower"]
    });
  });
});

describe("requireMutationOrigin",()=>{
  const env:Env={VIEWS_ALLOWED_ORIGINS:"https://staging.views.example,https://ops.views.example"};

  it("accepts only an exact allowlisted origin",()=>{
    const ok=new Request("https://staging.views.example/api/service-orders",{method:"POST",headers:{origin:"https://staging.views.example"}});
    expect(requireMutationOrigin(ok,env)).toBeNull();
  });

  it("rejects missing and lookalike origins",()=>{
    const missing=new Request("https://staging.views.example/api/service-orders",{method:"POST"});
    const lookalike=new Request("https://staging.views.example/api/service-orders",{method:"POST",headers:{origin:"https://staging.views.example.evil.test"}});
    expect(requireMutationOrigin(missing,env)?.status).toBe(403);
    expect(requireMutationOrigin(lookalike,env)?.status).toBe(403);
  });
});
