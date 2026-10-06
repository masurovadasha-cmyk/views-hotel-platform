import {describe,expect,it} from "vitest";
import {
  TunnelReplicaObserverError,
  evaluateReplicaMetrics,
  evaluateReplicaScrape,
  evaluateTunnelReplicaSet,
  parsePrometheusMetrics,
  runTunnelReplicaObserver
} from "./tunnel-replica-observer.mjs";

const healthyText=`
# HELP build_info Build information
# TYPE build_info gauge
build_info{version="2026.10.0"} 1
cloudflared_tunnel_ha_connections 4
cloudflared_tunnel_active_streams 3
cloudflared_tunnel_timer_retries 0
cloudflared_tunnel_request_errors 2
`;

const quickText=`
# HELP build_info Build information
# TYPE build_info gauge
build_info{version="2026.10.0"} 1
cloudflared_tunnel_ha_connections 0
cloudflared_tunnel_active_streams 0
`;

describe("tunnel replica observer",()=>{
  it("parses Prometheus metrics and sums labeled series",()=>{
    const metrics=parsePrometheusMetrics(`
build_info{version="x"} 1
quic_client_latest_rtt{conn_index="0"} 12
quic_client_latest_rtt{conn_index="1"} 18
`);
    expect(metrics.build_info).toBe(1);
    expect(metrics.quic_client_latest_rtt).toBe(30);
  });

  it("classifies healthy, degraded and down named-tunnel replicas",()=>{
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

  it("accepts a valid metrics scrape even when Quick Tunnel HA gauge is zero",()=>{
    const result=evaluateReplicaScrape(
      "cloudflared-a",
      parsePrometheusMetrics(quickText)
    );
    expect(result.state).toBe("reachable");
    expect(result.buildInfo).toBe(1);
    expect(result.haConnections).toBe(0);
  });

  it("fails scrape mode when cloudflared build_info is missing",()=>{
    const result=evaluateTunnelReplicaSet({
      "cloudflared-a":{cloudflared_tunnel_ha_connections:0},
      "cloudflared-b":{build_info:1}
    },4,"scrape");
    expect(result.ok).toBe(false);
    expect(result.findings).toContainEqual({
      code:"CLOUDFLARED_BUILD_INFO_MISSING",
      replica:"cloudflared-a"
    });
  });

  it("fails HA mode when any named-tunnel replica is degraded",()=>{
    const result=evaluateTunnelReplicaSet({
      "cloudflared-a":{cloudflared_tunnel_ha_connections:4},
      "cloudflared-b":{cloudflared_tunnel_ha_connections:3}
    });
    expect(result.ok).toBe(false);
    expect(result.healthyCount).toBe(1);
  });

  it("supports scrape-only mode for ephemeral transport checks",()=>{
    const result=evaluateTunnelReplicaSet({
      "cloudflared-a":parsePrometheusMetrics(quickText),
      "cloudflared-b":parsePrometheusMetrics(quickText)
    },4,"scrape");
    expect(result.ok).toBe(true);
    expect(result.mode).toBe("scrape");
    expect(result.healthyCount).toBe(2);
  });

  it("runs HA mode against two metrics endpoints without leaking URLs",async()=>{
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
      mode:"ha",
      replicaCount:2,
      healthyCount:2
    });
    expect(output).not.toContain("http://");
  });

  it("runs scrape mode for Quick Tunnel endpoints with zero HA gauge",async()=>{
    let output="";
    const code=await runTunnelReplicaObserver(
      ["--mode=scrape"],
      {
        VIEWS_TUNNEL_METRICS_ENDPOINTS_JSON:JSON.stringify({
          "cloudflared-a":"http://cloudflared-a:2000/metrics",
          "cloudflared-b":"http://cloudflared-b:2000/metrics"
        })
      },
      {write:value=>{output+=String(value)}},
      async()=>({
        ok:true,
        text:async()=>quickText
      })
    );
    expect(code).toBe(0);
    expect(JSON.parse(output)).toMatchObject({
      ok:true,
      mode:"scrape",
      healthyCount:2
    });
  });

  it("treats unreachable scrape endpoint as invalid",async()=>{
    let calls=0;
    let output="";
    const code=await runTunnelReplicaObserver(
      ["--mode=scrape"],
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
        return {ok:true,text:async()=>quickText};
      }
    );
    expect(code).toBe(1);
    expect(JSON.parse(output).findings).toContainEqual({
      code:"CLOUDFLARED_BUILD_INFO_MISSING",
      replica:"cloudflared-a"
    });
  });

  it("rejects malformed replica sets",()=>{
    expect(()=>evaluateTunnelReplicaSet({
      "cloudflared-a":{cloudflared_tunnel_ha_connections:4}
    })).toThrow(TunnelReplicaObserverError);
  });
});
