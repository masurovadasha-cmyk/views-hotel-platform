import {afterAll,describe,expect,it} from "vitest";
import {DatabaseService} from "../database/database.service";
import {InternalAuthRejectionService} from "./internal-auth-rejection.service";

const ORG="00000000-0000-0000-0000-000000000001";
const MANAGER={
  organizationId:ORG,
  userId:"20000000-0000-4000-8000-000000000001",
  membershipId:"30000000-0000-4000-8000-000000000001",
  requestId:"rejection-manager"
};

class RejectionFixtureController{}
function actorGateway(){}

const db=new DatabaseService();
const service=new InternalAuthRejectionService(db);

function context(){
  const request={
    headers:{},
    socket:{remoteAddress:"203.0.113.77"}
  };
  return {
    getType:()=> "http",
    switchToHttp:()=>({getRequest:()=>request}),
    getClass:()=>RejectionFixtureController,
    getHandler:()=>actorGateway
  } as any;
}

describe.sequential("Stage 7 internal auth rejection telemetry",()=>{
  it("aggregates repeated rejection reasons without storing raw IP",async()=>{
    const first=await service.record(context(),"invalid_internal_key");
    const second=await service.record(context(),"invalid_internal_key");

    expect(first).toBe(1);
    expect(second).toBe(2);

    const visible=await db.withActor(MANAGER,async client=>{
      return (await client.query<{count:string}>(
        "SELECT count(*)::text AS count FROM internal_auth_rejection_counters"
      )).rows[0].count;
    });

    expect(Number(visible)).toBe(0);
  });

  it("fails closed for non-platform roles reading rejection telemetry",async()=>{
    await expect(service.list(MANAGER,24,100))
      .rejects.toThrow("SECURITY_REJECTION_ROLE_FORBIDDEN");
  });

  it("uses one fixed network-unavailable bucket when client IP is unavailable",async()=>{
    const noNetwork={
      getType:()=> "http",
      switchToHttp:()=>({getRequest:()=>({headers:{},socket:{}})}),
      getClass:()=>RejectionFixtureController,
      getHandler:()=>actorGateway
    } as any;

    await expect(
      service.record(noNetwork,"missing_internal_key")
    ).resolves.toBeGreaterThanOrEqual(1);
  });
});

afterAll(async()=>{await db.onModuleDestroy()});
