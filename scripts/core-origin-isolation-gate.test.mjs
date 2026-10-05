import {describe,expect,it} from "vitest";
import {
  CoreOriginIsolationGateError,
  evaluateCoreOriginIsolation
} from "./core-origin-isolation-gate.mjs";

function fixture(){
  return {
    services:{
      postgres:{
        image:"postgres:16-alpine",
        networks:{core_data:null},
        security_opt:["no-new-privileges:true"]
      },
      core:{
        image:"views-core",
        expose:["3001"],
        environment:{
          TRUSTED_PROXY_MODE:"cloudflare_tunnel",
          VIEWS_TRUSTED_PROXY_CIDRS_JSON:'["172.30.0.2/32"]'
        },
        networks:{
          core_ingress:{ipv4_address:"172.30.0.3"},
          core_data:null,
          core_egress:null
        },
        read_only:true,
        cap_drop:["ALL"],
        security_opt:["no-new-privileges:true"]
      },
      cloudflared:{
        image:"cloudflare/cloudflared:latest",
        command:[
          "tunnel","--no-autoupdate","--loglevel","info","run"
        ],
        environment:{TUNNEL_TOKEN:"fixture-token"},
        networks:{
          core_ingress:{ipv4_address:"172.30.0.2"},
          tunnel_egress:null
        },
        read_only:true,
        cap_drop:["ALL"],
        security_opt:["no-new-privileges:true"]
      }
    },
    networks:{
      core_ingress:{internal:true},
      core_data:{internal:true},
      core_egress:{},
      tunnel_egress:{}
    }
  };
}

describe("Core origin isolation gate",()=>{
  it("accepts a private connector-only ingress topology",()=>{
    const result=evaluateCoreOriginIsolation(fixture());
    expect(result.ok).toBe(true);
    expect(result.connectorIp).toBe("172.30.0.2");
    expect(result.ingressMembers).toEqual(["cloudflared","core"]);
  });

  it("blocks host-published Core ports",()=>{
    const model=fixture();
    model.services.core.ports=[{target:3001,published:"3001"}];
    const result=evaluateCoreOriginIsolation(model);
    expect(result.blockers).toContainEqual({
      code:"HOST_PORT_PUBLISHED",
      service:"core"
    });
  });

  it("pins runtime trust to the exact connector address",()=>{
    const model=fixture();
    model.services.core.environment.VIEWS_TRUSTED_PROXY_CIDRS_JSON=
      '["172.30.0.0/29"]';
    const result=evaluateCoreOriginIsolation(model);
    expect(result.blockers).toContainEqual({
      code:"CONNECTOR_TRUST_PIN_MISMATCH",
      service:"core"
    });
  });

  it("rejects extra containers on the private ingress network",()=>{
    const model=fixture();
    model.services.debug={
      image:"busybox",
      networks:{core_ingress:{ipv4_address:"172.30.0.4"}}
    };
    const result=evaluateCoreOriginIsolation(model);
    expect(result.blockers).toContainEqual({
      code:"INGRESS_NETWORK_MEMBERSHIP_INVALID",
      service:null
    });
  });

  it("requires tunnel token injection outside process arguments",()=>{
    const model=fixture();
    model.services.cloudflared.command=[
      "tunnel","--no-autoupdate","run","--token","fixture"
    ];
    const result=evaluateCoreOriginIsolation(model);
    expect(result.blockers).toContainEqual({
      code:"TUNNEL_TOKEN_MUST_NOT_BE_IN_PROCESS_ARGS",
      service:"cloudflared"
    });
  });

  it("requires non-privileged hardened Core and connector containers",()=>{
    const model=fixture();
    model.services.core.read_only=false;
    model.services.cloudflared.privileged=true;
    const result=evaluateCoreOriginIsolation(model);
    expect(result.blockers.map(item=>item.code)).toContain(
      "READ_ONLY_ROOTFS_REQUIRED"
    );
    expect(result.blockers.map(item=>item.code)).toContain(
      "PRIVILEGED_CONTAINER_FORBIDDEN"
    );
  });

  it("fails closed on malformed compose input",()=>{
    expect(()=>evaluateCoreOriginIsolation({services:{},networks:{}}))
      .toThrow(CoreOriginIsolationGateError);
  });
});
