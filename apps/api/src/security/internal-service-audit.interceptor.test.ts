import {
  BadRequestException,UnauthorizedException
} from "@nestjs/common";
import {lastValueFrom,of,throwError} from "rxjs";
import {afterEach,describe,expect,it,vi} from "vitest";
import {InternalServiceAuditInterceptor} from "./internal-service-audit.interceptor";

const KEY="fixture-current-internal-api-key-material";

class TestController{}
function summary(){}

function context(headers:Record<string,string>,statusCode=200){
  const request={headers,method:"GET"};
  const response={statusCode};
  return {
    getType:()=> "http",
    switchToHttp:()=>({
      getRequest:()=>request,
      getResponse:()=>response
    }),
    getClass:()=>TestController,
    getHandler:()=>summary
  } as any;
}

afterEach(()=>{
  vi.unstubAllEnvs();
});

describe("internal service audit interceptor",()=>{
  it("creates and completes a durable audit around a trusted request",async()=>{
    vi.stubEnv("DATABASE_URL","postgresql://example.invalid/views");
    vi.stubEnv("VIEWS_INTERNAL_API_KEY",KEY);

    const audit={
      begin:vi.fn(async()=> "70000000-0000-4000-8000-000000000001"),
      complete:vi.fn(async()=>true)
    };
    const rejections={record:vi.fn(async()=>1)};
    const interceptor=new InternalServiceAuditInterceptor(
      audit as any,rejections as any
    );

    const observable=await interceptor.intercept(
      context({
        "x-views-internal-key":KEY,
        "x-views-service-id":"pages-bff",
        "x-organization-id":"00000000-0000-4000-8000-000000000001",
        "x-user-id":"20000000-0000-4000-8000-000000000001",
        "x-membership-id":"30000000-0000-4000-8000-000000000001",
        "x-request-id":"audit-test-request"
      }),
      {handle:()=>of({ok:true})} as any
    );

    await expect(lastValueFrom(observable)).resolves.toEqual({ok:true});
    expect(audit.begin).toHaveBeenCalledWith(expect.objectContaining({
      organizationId:"00000000-0000-4000-8000-000000000001",
      actorUserId:"20000000-0000-4000-8000-000000000001",
      actorMembershipId:"30000000-0000-4000-8000-000000000001",
      serviceId:"pages-bff",
      requestId:"audit-test-request",
      httpMethod:"GET",
      routePath:"TestController.summary"
    }));
    expect(audit.complete).toHaveBeenCalledWith(
      "70000000-0000-4000-8000-000000000001",
      200,
      null
    );
  });

  it("records a normalized failed outcome and rethrows the controller error",async()=>{
    vi.stubEnv("DATABASE_URL","postgresql://example.invalid/views");
    vi.stubEnv("VIEWS_INTERNAL_API_KEY",KEY);

    const audit={
      begin:vi.fn(async()=> "70000000-0000-4000-8000-000000000002"),
      complete:vi.fn(async()=>true)
    };
    const rejections={record:vi.fn(async()=>1)};
    const interceptor=new InternalServiceAuditInterceptor(
      audit as any,rejections as any
    );

    const observable=await interceptor.intercept(
      context({
        "x-views-internal-key":KEY,
        "x-views-service-id":"analytics-cron"
      }),
      {handle:()=>throwError(()=>new BadRequestException("INVALID_FIXTURE"))} as any
    );

    await expect(lastValueFrom(observable)).rejects.toBeInstanceOf(BadRequestException);
    expect(audit.complete).toHaveBeenCalledWith(
      "70000000-0000-4000-8000-000000000002",
      400,
      "INVALID_FIXTURE"
    );
  });

  it("rejects a valid key without service identity before controller execution",async()=>{
    vi.stubEnv("DATABASE_URL","postgresql://example.invalid/views");
    vi.stubEnv("VIEWS_INTERNAL_API_KEY",KEY);

    const audit={begin:vi.fn(),complete:vi.fn()};
    const rejections={record:vi.fn(async()=>1)};
    const interceptor=new InternalServiceAuditInterceptor(
      audit as any,rejections as any
    );

    await expect(interceptor.intercept(
      context({"x-views-internal-key":KEY}),
      {handle:()=>of({ok:true})} as any
    )).rejects.toBeInstanceOf(UnauthorizedException);

    expect(audit.begin).not.toHaveBeenCalled();
    expect(rejections.record).toHaveBeenCalledWith(
      expect.anything(),"missing_service_identity"
    );
  });
});
