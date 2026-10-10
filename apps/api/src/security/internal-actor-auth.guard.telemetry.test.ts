import {UnauthorizedException} from "@nestjs/common";
import {describe,expect,it,vi} from "vitest";
import {InternalActorAuthGuard} from "./internal-actor-auth.guard";

const KEY="fixture-current-internal-api-key-material";

class TestController{}
function protectedAction(){}

function context(headers:Record<string,string>){
  const request={
    headers,
    socket:{remoteAddress:"203.0.113.90"}
  };
  return {
    getType:()=> "http",
    switchToHttp:()=>({getRequest:()=>request}),
    getClass:()=>TestController,
    getHandler:()=>protectedAction
  } as any;
}

describe("internal actor guard rejection telemetry",()=>{
  it("records a missing-key rejection before returning 401",async()=>{
    process.env.DATABASE_URL="postgresql://example.invalid/views";
    process.env.VIEWS_INTERNAL_API_KEY=KEY;

    const rejections={record:vi.fn(async()=>1)};
    const guard=new InternalActorAuthGuard(rejections as any);

    await expect(guard.canActivate(context({
      "x-organization-id":"00000000-0000-4000-8000-000000000001",
      "x-user-id":"20000000-0000-4000-8000-000000000001",
      "x-membership-id":"30000000-0000-4000-8000-000000000001"
    }))).rejects.toBeInstanceOf(UnauthorizedException);

    expect(rejections.record).toHaveBeenCalledWith(
      expect.anything(),"missing_internal_key"
    );
  });

  it("records partial actor context separately",async()=>{
    process.env.DATABASE_URL="postgresql://example.invalid/views";
    process.env.VIEWS_INTERNAL_API_KEY=KEY;

    const rejections={record:vi.fn(async()=>1)};
    const guard=new InternalActorAuthGuard(rejections as any);

    await expect(guard.canActivate(context({
      "x-organization-id":"00000000-0000-4000-8000-000000000001"
    }))).rejects.toBeInstanceOf(UnauthorizedException);

    expect(rejections.record).toHaveBeenCalledWith(
      expect.anything(),"partial_actor_context"
    );
  });
});
