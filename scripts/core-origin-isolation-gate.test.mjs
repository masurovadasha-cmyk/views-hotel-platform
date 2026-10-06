import {describe,expect,it} from "vitest";
import {
  CoreOriginIsolationGateError,
  evaluateCoreOriginIsolation
} from "./core-origin-isolation-gate.mjs";

function connector(ip){
  return {
    image:"cloudflare/cloudflared:latest",
    command:[
      "tunnel","--no-autoupdate","--loglevel","info","run"
    ],
    environment:{TUNNEL_TOKEN:"fixture-shared-tunnel-token"},
    networks:{
      core_ingress:{ipv4_address:ip},
      tunnel_egress:null
    },
    read_only:true,
    cap_drop:["ALL"],
    security_opt:["no-new-privileges:true"]
  };
}

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
          VIEWS_TRUSTED_PROXY_CIDRS_JSON:
            '["172.30.0.2/32","172.30.0.4/32"]'
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
      "cloudflared-a":connector("172.30.0.2"),
      "cloudflared-b":connector("172.30.0.4")
    },
    networks:{
      core_ingress:{internal:true},
      core_data:{internal:true},
      core_egress:{},
      tunnel_egress:{}
    }
  };
}

describe("Core origin isolation HA gate",()=>{
  it("accepts exactly pinned dual-connector topology",()=>{
    const result=evaluateCoreOriginIsolation(fixture());
    expect(result.ok).toBe(true);
    expect(result.connectorCount).toBe(2);
    expect(result.connectorIps).toEqual([
      "172.30.0.2","172.30.0.4"
    ]);
    expect(result.ingressMembers).toEqual([
      "cloudflared-a","cloudflared-b","core"
    ]);
  });

  it("requires at least two tunnel replicas",()=>{
    const model=fixture();
    delete model.services["cloudflared-b"];
    model.services.core.environment.VIEWS_TRUSTED_PROXY_CIDRS_JSON=
      '["172.30.0.2/32"]';
    const result=evaluateCoreOriginIsolation(model);
    expect(result.blockers).toContainEqual({
      code:"HA_CONNECTOR_REPLICA_COUNT_INVALID",
      service:null
    });
  });

  it("blocks host-published Core or connector ports",()=>{
    const model=fixture();
    model.services.core.ports=[{target:3001,published:"3001"}];
    model.services["cloudflared-a"].ports=[
      {target:2000,published:"2000"}
    ];
    const result=evaluateCoreOriginIsolation(model);
    expect(result.blockers).toContainEqual({
      code:"HOST_PORT_PUBLISHED",
      service:"core"
    });
    expect(result.blockers).toContainEqual({
      code:"HOST_PORT_PUBLISHED",
      service:"cloudflared-a"
    });
  });

  it("pins runtime trust to the exact connector set",()=>{
    const model=fixture();
    model.services.core.environment.VIEWS_TRUSTED_PROXY_CIDRS_JSON=
      '["172.30.0.2/32"]';
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
      networks:{core_ingress:{ipv4_address:"172.30.0.5"}}
    };
    const result=evaluateCoreOriginIsolation(model);
    expect(result.blockers).toContainEqual({
      code:"INGRESS_NETWORK_MEMBERSHIP_INVALID",
      service:null
    });
  });

  it("requires all replicas to use the same tunnel credential",()=>{
    const model=fixture();
    model.services["cloudflared-b"].environment.TUNNEL_TOKEN=
      "different-tunnel-token";
    const result=evaluateCoreOriginIsolation(model);
    expect(result.blockers).toContainEqual({
      code:"CONNECTOR_TUNNEL_TOKEN_MISMATCH",
      service:null
    });
  });

  it("requires tunnel token injection outside process arguments",()=>{
    const model=fixture();
    model.services["cloudflared-a"].command=[
      "tunnel","--no-autoupdate","run","--token","fixture"
    ];
    const result=evaluateCoreOriginIsolation(model);
    expect(result.blockers).toContainEqual({
      code:"TUNNEL_TOKEN_MUST_NOT_BE_IN_PROCESS_ARGS",
      service:"cloudflared-a"
    });
  });

  it("rejects connector IP collisions",()=>{
    const model=fixture();
    model.services["cloudflared-b"].networks.core_ingress.ipv4_address=
      "172.30.0.2";
    const result=evaluateCoreOriginIsolation(model);
    expect(result.blockers).toContainEqual({
      code:"CONNECTOR_IP_COLLISION",
      service:null
    });
  });

  it("requires non-privileged hardened Core and connectors",()=>{
    const model=fixture();
    model.services.core.read_only=false;
    model.services["cloudflared-b"].privileged=true;
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
