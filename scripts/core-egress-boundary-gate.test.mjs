import {describe,expect,it} from "vitest";
import {
  CoreEgressBoundaryError,
  evaluateCoreEgressBoundary
} from "./core-egress-boundary-gate.mjs";

function fixture(withRelay=true){
  const services={
    core:{
      networks:{
        core_ingress:{ipv4_address:"172.30.0.3"},
        core_data:null,
        core_egress:{ipv4_address:"172.31.0.2"}
      }
    },
    postgres:{networks:{core_data:null}},
    "cloudflared-a":{networks:{core_ingress:null,tunnel_egress:null}},
    "cloudflared-b":{networks:{core_ingress:null,tunnel_egress:null}}
  };
  if(withRelay){
    services["egress-relay"]={
      networks:{
        core_egress:{ipv4_address:"172.31.0.3"},
        egress_public:null
      }
    };
  }
  return {
    services,
    networks:{
      core_ingress:{internal:true},
      core_data:{internal:true},
      core_egress:{internal:true},
      egress_public:{},
      tunnel_egress:{}
    }
  };
}

describe("Core egress boundary gate",()=>{
  it("accepts relay-only Core egress",()=>{
    const result=evaluateCoreEgressBoundary(fixture());
    expect(result.ok).toBe(true);
    expect(result.mode).toBe("relay_only");
    expect(result.egressMembers).toEqual(["core","egress-relay"]);
  });

  it("still accepts Stage 7.16 default-deny model without relay",()=>{
    const result=evaluateCoreEgressBoundary(fixture(false));
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
  });

  it("blocks Core joining relay public network",()=>{
    const model=fixture();
    model.services.core.networks.egress_public=null;
    const result=evaluateCoreEgressBoundary(model);
    expect(result.blockers).toContainEqual({
      code:"CORE_PUBLIC_EGRESS_FORBIDDEN"
    });
  });

  it("blocks unrelated service joining Core egress",()=>{
    const model=fixture();
    model.services.debug={networks:{core_egress:null}};
    const result=evaluateCoreEgressBoundary(model);
    expect(result.blockers).toContainEqual({
      code:"CORE_EGRESS_NETWORK_MEMBERSHIP_INVALID",
      members:["core","debug","egress-relay"]
    });
  });

  it("fails closed on malformed model",()=>{
    expect(()=>evaluateCoreEgressBoundary({services:{},networks:{}}))
      .toThrow(CoreEgressBoundaryError);
  });
});
