import {describe,expect,it} from "vitest";
import {
  CoreEgressBoundaryError,
  evaluateCoreEgressBoundary
} from "./core-egress-boundary-gate.mjs";

function fixture(){
  return {
    services:{
      core:{
        networks:{
          core_ingress:{ipv4_address:"172.30.0.3"},
          core_data:null,
          core_egress:null
        }
      },
      postgres:{networks:{core_data:null}},
      "cloudflared-a":{networks:{core_ingress:null,tunnel_egress:null}},
      "cloudflared-b":{networks:{core_ingress:null,tunnel_egress:null}}
    },
    networks:{
      core_ingress:{internal:true},
      core_data:{internal:true},
      core_egress:{internal:true},
      tunnel_egress:{}
    }
  };
}

describe("Core egress boundary gate",()=>{
  it("accepts Core attached only to internal networks",()=>{
    const result=evaluateCoreEgressBoundary(fixture());
    expect(result.ok).toBe(true);
    expect(result.mode).toBe("default_deny");
    expect(result.egressMembers).toEqual(["core"]);
  });

  it("blocks any external-capable Core network",()=>{
    const model=fixture();
    model.networks.core_egress.internal=false;
    const result=evaluateCoreEgressBoundary(model);
    expect(result.blockers).toContainEqual({
      code:"CORE_EXTERNAL_NETWORK_FORBIDDEN",
      network:"core_egress"
    });
    expect(result.blockers).toContainEqual({
      code:"CORE_EGRESS_NETWORK_MUST_BE_INTERNAL"
    });
  });

  it("blocks an extra public network attached to Core",()=>{
    const model=fixture();
    model.networks.public={};
    model.services.core.networks.public=null;
    const result=evaluateCoreEgressBoundary(model);
    expect(result.blockers).toContainEqual({
      code:"CORE_EXTERNAL_NETWORK_FORBIDDEN",
      network:"public"
    });
  });

  it("blocks host network mode and extra hosts",()=>{
    const model=fixture();
    model.services.core.network_mode="host";
    model.services.core.extra_hosts=["host.docker.internal:host-gateway"];
    const result=evaluateCoreEgressBoundary(model);
    expect(result.blockers).toContainEqual({
      code:"CORE_NETWORK_MODE_FORBIDDEN"
    });
    expect(result.blockers).toContainEqual({
      code:"CORE_EXTRA_HOSTS_FORBIDDEN"
    });
  });

  it("blocks another service joining the Core egress segment",()=>{
    const model=fixture();
    model.services.debug={networks:{core_egress:null}};
    const result=evaluateCoreEgressBoundary(model);
    expect(result.blockers).toContainEqual({
      code:"CORE_EGRESS_NETWORK_MEMBERSHIP_INVALID",
      members:["core","debug"]
    });
  });

  it("fails closed on malformed Compose model",()=>{
    expect(()=>evaluateCoreEgressBoundary({services:{},networks:{}}))
      .toThrow(CoreEgressBoundaryError);
  });
});
