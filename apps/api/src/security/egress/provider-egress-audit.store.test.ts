import {describe,expect,it} from "vitest";
import {ProviderEgressAuditStore} from "./provider-egress-audit.store";
import type {EgressAudit} from "./provider-egress-client";

type QueryCall={sql:string;params:unknown[]};

function fakeDb(){
  const calls:QueryCall[]=[];
  const db={
    async withOrganization<T>(
      organizationId:string,
      work:(client:{query:<R>(sql:string,params?:unknown[])=>Promise<{rows:R[]}>})=>Promise<T>
    ){
      expect(organizationId).toBe("00000000-0000-4000-8000-000000000001");
      return work({
        async query<R>(sql:string,params:unknown[]=[]){
          calls.push({sql,params});
          if(sql.includes("begin_provider_egress_attempt")){
            return {rows:[{attempt_id:"10000000-0000-4000-8000-000000000001"} as R]};
          }
          return {rows:[{completed:true} as R]};
        }
      });
    }
  };
  return {db,calls};
}

function audit(event:EgressAudit["event"],extra:Partial<EgressAudit>={}):EgressAudit{
  return {
    schemaVersion:1,event,providerId:"fixture",operationId:"status",
    requestId:"11111111-2222-4333-8444-555555555555",
    attempt:1,deadlineMs:2000,elapsedMs:12,
    delivery:event==="completed"?"response":"not-sent",
    ...extra
  };
}

describe("ProviderEgressAuditStore",()=>{
  it("persists a started record before provider dispatch",async()=>{
    const {db,calls}=fakeDb();
    const store=new ProviderEgressAuditStore(db as never);
    await store.forOrganization(
      "00000000-0000-4000-8000-000000000001"
    ).write(audit("started"));
    expect(calls).toHaveLength(1);
    expect(calls[0].sql).toContain("begin_provider_egress_attempt");
    expect(calls[0].params).toEqual([
      "fixture","status",
      "11111111-2222-4333-8444-555555555555",2000
    ]);
  });

  it("persists only safe final metadata",async()=>{
    const {db,calls}=fakeDb();
    const store=new ProviderEgressAuditStore(db as never);
    await store.forOrganization(
      "00000000-0000-4000-8000-000000000001"
    ).write(audit("failed",{
      delivery:"unknown",code:"EGRESS_TRANSPORT_FAILED",elapsedMs:45
    }));
    expect(calls[0].sql).toContain("complete_provider_egress_attempt");
    expect(calls[0].params).toEqual([
      "fixture","status","11111111-2222-4333-8444-555555555555",
      "failed","unknown",null,"EGRESS_TRANSPORT_FAILED",45
    ]);
    expect(JSON.stringify(calls)).not.toContain("Bearer");
    expect(JSON.stringify(calls)).not.toContain("passport");
  });

  it("rejects an invalid tenant before database access",()=>{
    const {db,calls}=fakeDb();
    const store=new ProviderEgressAuditStore(db as never);
    expect(()=>store.forOrganization("not-a-uuid"))
      .toThrow("PROVIDER_EGRESS_ORGANIZATION_INVALID");
    expect(calls).toHaveLength(0);
  });
});
