import {describe,expect,it} from "vitest";
import {CoreBridgeError,coreApiConfig,resolveCoreActor,resolveCoreProperty} from "./_core-bridge";
import type {D1Database,D1Result,D1Statement,Env} from "./_shared";
import type {StaffSession} from "./_authorization";

function dbFor(rows:Record<string,Record<string,unknown>|null>):D1Database{
  return {
    prepare:(sql:string)=>{
      const statement={} as D1Statement;
      let bound:unknown[]=[];
      statement.bind=(...values:unknown[])=>{bound=values;return statement};
      statement.first=async<T=Record<string,unknown>>()=>{
        const key=sql.includes("core_identity_links")
          ?"identity:"+String(bound[0])+":"+String(bound[1])
          :"property:"+String(bound[0])+":"+String(bound[1]);
        return (rows[key]??null) as T|null;
      };
      statement.all=async()=>({results:[]});
      statement.run=async()=>({meta:{changes:0}});
      return statement;
    },
    batch:async()=>[] as D1Result[]
  };
}

const session:StaffSession={
  mode:"staff",
  userId:"staff-local-1",
  role:"general_manager",
  organizationId:"views",
  propertyIds:["utower"]
};

describe("Core identity bridge",()=>{
  it("resolves only explicit active Core UUID mappings",async()=>{
    const env:Env={DB:dbFor({
      "identity:views:staff-local-1":{
        core_organization_id:"00000000-0000-4000-8000-000000000001",
        core_user_id:"20000000-0000-4000-8000-000000000001",
        core_membership_id:"30000000-0000-4000-8000-000000000001"
      }
    })};

    await expect(resolveCoreActor(session,env)).resolves.toEqual({
      organizationId:"00000000-0000-4000-8000-000000000001",
      userId:"20000000-0000-4000-8000-000000000001",
      membershipId:"30000000-0000-4000-8000-000000000001"
    });
  });

  it("fails closed when identity is not linked or malformed",async()=>{
    await expect(resolveCoreActor(session,{DB:dbFor({})}))
      .rejects.toMatchObject({code:"CORE_IDENTITY_NOT_LINKED"});

    await expect(resolveCoreActor(session,{DB:dbFor({
      "identity:views:staff-local-1":{
        core_organization_id:"not-a-uuid",
        core_user_id:"20000000-0000-4000-8000-000000000001",
        core_membership_id:"30000000-0000-4000-8000-000000000001"
      }
    })})).rejects.toMatchObject({code:"CORE_ORGANIZATION_ID_INVALID"});
  });

  it("checks local property scope before resolving a Core property",async()=>{
    const env:Env={DB:dbFor({
      "property:views:utower":{
        core_property_id:"00000000-0000-4000-8000-000000000002"
      }
    })};

    await expect(resolveCoreProperty(session,env,"utower"))
      .resolves.toBe("00000000-0000-4000-8000-000000000002");

    await expect(resolveCoreProperty(session,env,"nest-one"))
      .rejects.toMatchObject({code:"PROPERTY_FORBIDDEN"});
  });

  it("requires a server key and HTTPS in production",()=>{
    const base={
      VIEWS_ENV:"production",
      VIEWS_CORE_API_URL:"https://core.views.example"
    } satisfies Env;

    expect(()=>coreApiConfig(base))
      .toThrowError(CoreBridgeError);

    expect(()=>coreApiConfig({
      ...base,
      VIEWS_CORE_API_URL:"http://core.views.example",
      VIEWS_CORE_API_KEY:"x".repeat(32)
    })).toThrow("CORE_API_URL_INSECURE");

    expect(coreApiConfig({
      ...base,
      VIEWS_CORE_API_KEY:"x".repeat(32)
    })).toEqual({
      baseUrl:"https://core.views.example",
      internalKey:"x".repeat(32)
    });
  });
});
