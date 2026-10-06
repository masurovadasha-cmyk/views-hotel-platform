import {describe,expect,it} from "vitest";
import {evaluateCoreEgressRelay} from "./core-egress-relay-gate.mjs";

const IMAGE="ubuntu/squid:6.6-24.04_beta@sha256:6a097f68bae708cedbabd6188d68c7e2e7a38cedd05a176e1cc0ba29e3bbe029";

function fixture(){
  return {
    services:{
      core:{
        networks:{
          core_ingress:{ipv4_address:"172.30.0.3"},
          core_data:{},
          core_egress:{ipv4_address:"172.31.0.2"}
        }
      },
      "egress-relay":{
        image:IMAGE,
        networks:{
          core_egress:{ipv4_address:"172.31.0.3"},
          egress_public:{}
        },
        volumes:[
          "./infra/egress/squid.conf:/etc/squid/squid.conf:ro",
          "./infra/egress/allowed-domains.txt:/etc/squid/allowed-domains.txt:ro"
        ],
        security_opt:["no-new-privileges:true"]
      }
    },
    networks:{
      core_ingress:{internal:true},
      core_data:{internal:true},
      core_egress:{internal:true},
      egress_public:{driver:"bridge"}
    }
  };
}

describe("Core controlled egress relay gate",()=>{
  it("accepts private Core -> relay -> public topology",()=>{
    const result=evaluateCoreEgressRelay(fixture());
    expect(result.ok).toBe(true);
    expect(result.privateMembers).toEqual(["core","egress-relay"]);
    expect(result.publicMembers).toEqual(["egress-relay"]);
  });

  it("rejects Core on public egress network",()=>{
    const model=fixture();
    model.services.core.networks.egress_public={};
    expect(evaluateCoreEgressRelay(model).blockers.map(x=>x.code))
      .toContain("CORE_PUBLIC_EGRESS_FORBIDDEN");
  });

  it("rejects public relay host ports",()=>{
    const model=fixture();
    model.services["egress-relay"].ports=["3128:3128"];
    expect(evaluateCoreEgressRelay(model).blockers.map(x=>x.code))
      .toContain("EGRESS_RELAY_HOST_PORT_FORBIDDEN");
  });

  it("requires exact relay image pin",()=>{
    const model=fixture();
    model.services["egress-relay"].image="ubuntu/squid:latest";
    expect(evaluateCoreEgressRelay(model).blockers.map(x=>x.code))
      .toContain("EGRESS_RELAY_IMAGE_NOT_PINNED");
  });

  it("requires both immutable policy mounts",()=>{
    const model=fixture();
    model.services["egress-relay"].volumes=[];
    const codes=evaluateCoreEgressRelay(model).blockers.map(x=>x.code);
    expect(codes).toContain("EGRESS_RELAY_CONFIG_MOUNT_REQUIRED");
    expect(codes).toContain("EGRESS_RELAY_POLICY_MOUNT_REQUIRED");
  });
});
