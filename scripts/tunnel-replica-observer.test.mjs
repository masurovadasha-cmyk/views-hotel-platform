import {describe,expect,it} from "vitest";
import {
  TunnelReplicaObserverError,
  evaluateReplicaMetrics,
  evaluateTunnelReplicaSet,
  parsePrometheusMetrics,
  runTunnelReplicaObserver
} from "./tunnel-replica-observer.mjs";

const healthyText=`
# HELP cloudflared_tunnel_ha_connections Number of active HA connections
# TYPE cloudflared_tunnel_ha_connections gauge
cloudflared_tunnel_ha_connections 4
cloudflared_tunnel_active_streams 3
cloudflared_tunnel_timer_retries 0
cloudflared_tunnel_request_errors 2
`;

describe("tunnel replica observer",()=>{
  it("parses Prometheus metrics and sums labeled series",()=>{
    const metrics=parsePrometheusMetrics(`
cloudflared_tunnel_ha_connections 4
quic_client_latest_rtt{conn_index="0"} 12
quic_client_latest_rtt{conn_index="1"} 18
`);
    expect(metrics.cloudflared_tunnel_ha_connections).toBe(4);
    expect(metrics.quic_client_latest_rtt).toBe(30);
  });

  it("classifies healthy, degraded and down replicas",()=>{
    expect(evaluateReplicaMetrics("cloudflared-a",{
      cloudflared_tunnel_ha_connections:4
    }).state).toBe("healthy");

    expect(evaluateReplicaMetrics("cloudflared-a",{
      cloudflared_tunnel_ha_connections:2
    }).state).toBe("degraded");

    expect(evaluateReplicaMetrics("cloudflared-a",{
      cloudflared_tunnel_ha_connections:0
    }).state).toBe("down");
  });

  it("fails the set when any replica is degraded",()=>{
    const result=evaluateTunnelReplicaSet({
      "cloudflared-a":{cloudflared_tunnel_ha_connections:4},
      "cloudflared-b":{cloudflared_tunnel_ha_connections:3}
    });
    expect(result.ok).toBe(false);
    expect(result.healthyCount).toBe(1);
    expect(result.findings).toContainEqual({
      code:"TUNNEL_REPLICA_DEGRADED",
      replica:"cloudflared-b",
      haConnections:3,
      required:4
    });
  });

  it("surfaces heartbeat retries without exposing raw endpoints",()=>{
    const result=evaluateTunnelReplicaSet({
      "cloudflared-a":{
        cloudflared_tunnel_ha_connections:4,
        cloudflared_tunnel_timer_retries:1
      },
      "cloudflared-b":{
        cloudflared_tunnel_ha_connections:4
      }
    });
    expect(result.ok).toBe(false);
    expect(result.findings).toContainEqual({
      code:"TUNNEL_HEARTBEAT_RETRIES_PRESENT",
      replica:"cloudflared-a",
      value:1
    });
  });

  it("supports controlled lower thresholds for ephemeral proofs",()=>{
    const result=evaluateTunnelReplicaSet({
      "cloudflared-a":{cloudflared_tunnel_ha_connections:1},
      "cloudflared-b":{cloudflared_tunnel_ha_connections:1}
    },1);
    expect(result.ok).toBe(true);
  });

  it("runs against two metrics endpoints without leaking endpoint URLs",async()=>{
    let output="";
    const code=await runTunnelReplicaObserver(
      [],
      {
        VIEWS_TUNNEL_METRICS_ENDPOINTS_JSON:JSON.stringify({
          "cloudflared-a":"http://cloudflared-a:2000/metrics",
          "cloudflared-b":"http://cloudflared-b:2000/metrics"
        })
      },
      {write:value=>{output+=String(value)}},
      async()=>({
        ok:true,
        text:async()=>healthyText
      })
    );
    expect(code).toBe(0);
    expect(JSON.parse(output)).toMatchObject({
      ok:true,
      replicaCount:2,
      healthyCount:2
    });
    expect(output).not.toContain("http://");
  });

  it("treats an unreachable replica as down",async()=>{
    let calls=0;
    let output="";
    const code=await runTunnelReplicaObserver(
      ["--min-connections=1"],
      {
        VIEWS_TUNNEL_METRICS_ENDPOINTS_JSON:JSON.stringify({
          "cloudflared-a":"http://cloudflared-a:2000/metrics",
          "cloudflared-b":"http://cloudflared-b:2000/metrics"
        })
      },
      {write:value=>{output+=String(value)}},
      async()=>{
        calls+=1;
        if(calls===1)throw new Error("offline");
        return {ok:true,text:async()=>healthyText};
      }
    );
    expect(code).toBe(1);
    expect(JSON.parse(output).downCount).toBe(1);
  });

  it("rejects malformed endpoint configuration",()=>{
    expect(()=>evaluateTunnelReplicaSet({
      "cloudflared-a":{cloudflared_tunnel_ha_connections:4}
    })).toThrow(TunnelReplicaObserverError);
  });
});
