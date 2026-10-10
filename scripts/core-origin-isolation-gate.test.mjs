import {describe,expect,it} from "vitest";
import {
  CoreOriginIsolationGateError,
  evaluateCoreOriginIsolation
} from "./core-origin-isolation-gate.mjs";

function connector(ip){
  return {
    image:"cloudflare/cloudflared:latest",
    command:[
      "tunnel","--no-autoupdate","--metrics","0.0.0.0:2000","run"
    ],
    environment:{TUNNEL_TOKEN:"fixture-shared-tunnel-token"},
    networks:{
      core_ingress:{ipv4_address:ip},
      tunnel_egress:null,
      tunnel_metrics:null
    },
    read_only:true,
    cap_drop:["ALL"],
    security_opt:["no-new-privileges:true"]
  };
}

function observer(){
  return {
    image:"node:22-alpine",
    command:["node","/ops/tunnel-replica-observer.mjs"],
    environment:{
      VIEWS_TUNNEL_METRICS_ENDPOINTS_JSON:JSON.stringify({
        "cloudflared-a":"http://cloudflared-a:2000/metrics",
        "cloudflared-b":"http://cloudflared-b:2000/metrics"
      })
    },
    networks:{tunnel_metrics:null},
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
      "cloudflared-b":connector("172.30.0.4"),
      "tunnel-observer":observer()
    },
    networks:{
      core_ingress:{internal:true},
      core_data:{internal:true},
      core_egress:{},
      tunnel_egress:{},
      tunnel_metrics:{internal:true}
    }
  };
}

describe("Core origin isolation HA + observability gate",()=>{
  it("accepts pinned dual connectors and isolated metrics observer",()=>{
    const result=evaluateCoreOriginIsolation(fixture());
    expect(result.ok).toBe(true);
    expect(result.schemaVersion).toBe(3);
    expect(result.connectorCount).toBe(2);
    expect(result.connectorIps).toEqual([
      "172.30.0.2","172.30.0.4"
    ]);
    expect(result.metricsMembers).toEqual([
      "cloudflared-a","cloudflared-b","tunnel-observer"
    ]);
  });

  it("requires at least two tunnel replicas",()=>{
    const model=fixture();
    delete model.services["cloudflared-b"];
    model.services.core.environment.VIEWS_TRUSTED_PROXY_CIDRS_JSON=
      '["172.30.0.2/32"]';
    model.services["tunnel-observer"].environment
      .VIEWS_TUNNEL_METRICS_ENDPOINTS_JSON=JSON.stringify({
        "cloudflared-a":"http://cloudflared-a:2000/metrics"
      });
    const result=evaluateCoreOriginIsolation(model);
    expect(result.blockers).toContainEqual({
      code:"HA_CONNECTOR_REPLICA_COUNT_INVALID",
      service:null
    });
  });

  it("requires the metrics network to remain private",()=>{
    const model=fixture();
    model.networks.tunnel_metrics.internal=false;
    const result=evaluateCoreOriginIsolation(model);
    expect(result.blockers).toContainEqual({
      code:"PRIVATE_METRICS_NETWORK_REQUIRED",
      service:null
    });
  });

  it("requires cloudflared metrics endpoints on every replica",()=>{
    const model=fixture();
    model.services["cloudflared-b"].command=[
      "tunnel","--no-autoupdate","run"
    ];
    const result=evaluateCoreOriginIsolation(model);
    expect(result.blockers).toContainEqual({
      code:"TUNNEL_METRICS_ENDPOINT_REQUIRED",
      service:"cloudflared-b"
    });
  });

  it("keeps Core off the metrics network",()=>{
    const model=fixture();
    model.services.core.networks.tunnel_metrics=null;
    const result=evaluateCoreOriginIsolation(model);
    expect(result.blockers).toContainEqual({
      code:"CORE_METRICS_NETWORK_FORBIDDEN",
      service:"core"
    });
  });

  it("rejects observer endpoints that do not match replicas",()=>{
    const model=fixture();
    model.services["tunnel-observer"].environment
      .VIEWS_TUNNEL_METRICS_ENDPOINTS_JSON=JSON.stringify({
        "cloudflared-a":"http://cloudflared-a:2000/metrics",
        "cloudflared-b":"http://wrong:2000/metrics"
      });
    const result=evaluateCoreOriginIsolation(model);
    expect(result.blockers).toContainEqual({
      code:"OBSERVER_ENDPOINTS_MISMATCH",
      service:"tunnel-observer"
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

  it("fails closed on malformed compose input",()=>{
    expect(()=>evaluateCoreOriginIsolation({services:{},networks:{}}))
      .toThrow(CoreOriginIsolationGateError);
  });
});
