import {readFile} from "node:fs/promises";
import {pathToFileURL} from "node:url";

const DEFAULT_MIN_CONNECTIONS=4;
const DEFAULT_TIMEOUT_MS=5000;

export class TunnelReplicaObserverError extends Error{
  constructor(code){
    super(code);
    this.name="TunnelReplicaObserverError";
    this.code=code;
  }
}

export function parsePrometheusMetrics(text){
  const totals=new Map();
  const raw=String(text??"");
  for(const line of raw.split(/\r?\n/)){
    const trimmed=line.trim();
    if(!trimmed||trimmed.startsWith("#"))continue;

    const match=trimmed.match(/^([a-zA-Z_:][a-zA-Z0-9_:]*)(?:\{[^}]*\})?\s+([^\s]+)(?:\s+\d+)?$/);
    if(!match)continue;

    const value=Number(match[2]);
    if(!Number.isFinite(value))continue;

    totals.set(match[1],(totals.get(match[1])??0)+value);
  }
  return Object.fromEntries(totals);
}

export function evaluateReplicaMetrics(
  name,
  metrics,
  minConnections=DEFAULT_MIN_CONNECTIONS
){
  if(
    !Number.isInteger(minConnections)||
    minConnections<1||
    minConnections>16
  ){
    throw new TunnelReplicaObserverError("INVALID_MIN_CONNECTIONS");
  }

  const haConnections=numberMetric(
    metrics,
    "cloudflared_tunnel_ha_connections"
  );
  const timerRetries=numberMetric(
    metrics,
    "cloudflared_tunnel_timer_retries",
    0
  );
  const activeStreams=numberMetric(
    metrics,
    "cloudflared_tunnel_active_streams",
    0
  );
  const requestErrors=numberMetric(
    metrics,
    "cloudflared_tunnel_request_errors",
    0
  );

  const state=haConnections>=minConnections
    ?"healthy"
    :haConnections>0
      ?"degraded"
      :"down";

  const findings=[];
  if(state!=="healthy"){
    findings.push({
      code:state==="down"
        ?"TUNNEL_REPLICA_DOWN"
        :"TUNNEL_REPLICA_DEGRADED",
      replica:name,
      haConnections,
      required:minConnections
    });
  }
  if(timerRetries>0){
    findings.push({
      code:"TUNNEL_HEARTBEAT_RETRIES_PRESENT",
      replica:name,
      value:timerRetries
    });
  }

  return {
    name,
    state,
    haConnections,
    requiredConnections:minConnections,
    activeStreams,
    timerRetries,
    requestErrors,
    findings
  };
}

export function evaluateTunnelReplicaSet(
  replicas,
  minConnections=DEFAULT_MIN_CONNECTIONS
){
  if(!replicas||typeof replicas!=="object"||Array.isArray(replicas)){
    throw new TunnelReplicaObserverError("INVALID_REPLICA_SET");
  }

  const names=Object.keys(replicas).sort();
  if(names.length<2||names.length>25){
    throw new TunnelReplicaObserverError("INVALID_REPLICA_COUNT");
  }

  const results=names.map(name=>
    evaluateReplicaMetrics(name,replicas[name],minConnections)
  );
  const findings=results.flatMap(result=>result.findings);
  const healthyCount=results.filter(result=>result.state==="healthy").length;
  const downCount=results.filter(result=>result.state==="down").length;

  return {
    ok:findings.length===0,
    schemaVersion:1,
    replicaCount:results.length,
    healthyCount,
    downCount,
    minConnections,
    replicas:results,
    findings
  };
}

export async function runTunnelReplicaObserver(
  argv=process.argv.slice(2),
  env=process.env,
  output=process.stdout,
  fetchImpl=globalThis.fetch
){
  const options=parseArgs(argv,env);
  const replicas={};

  for(const [name,url] of Object.entries(options.endpoints)){
    let response;
    try{
      response=await fetchImpl(url,{
        headers:{
          accept:"text/plain",
          "user-agent":"views-stage7-tunnel-observer"
        },
        signal:AbortSignal.timeout(options.timeoutMs)
      });
    }catch{
      replicas[name]={
        cloudflared_tunnel_ha_connections:0
      };
      continue;
    }

    if(!response?.ok){
      replicas[name]={
        cloudflared_tunnel_ha_connections:0
      };
      continue;
    }

    replicas[name]=parsePrometheusMetrics(await response.text());
  }

  const result=evaluateTunnelReplicaSet(
    replicas,
    options.minConnections
  );
  output.write(JSON.stringify(result)+"\n");
  return result.ok?0:1;
}

function parseArgs(argv,env){
  let minConnections=DEFAULT_MIN_CONNECTIONS;
  let timeoutMs=DEFAULT_TIMEOUT_MS;
  const cliEndpoints={};

  for(const arg of argv){
    if(arg.startsWith("--endpoint=")){
      const raw=arg.slice("--endpoint=".length);
      const index=raw.indexOf("=");
      if(index<1){
        throw new TunnelReplicaObserverError("INVALID_ENDPOINT_ARGUMENT");
      }
      const name=raw.slice(0,index).trim();
      const url=raw.slice(index+1).trim();
      validateEndpoint(name,url);
      cliEndpoints[name]=url;
    }else if(arg.startsWith("--min-connections=")){
      minConnections=Number(arg.slice("--min-connections=".length));
    }else if(arg.startsWith("--timeout-ms=")){
      timeoutMs=Number(arg.slice("--timeout-ms=".length));
    }else if(arg.startsWith("--fixture=")){
      throw new TunnelReplicaObserverError(
        "FIXTURE_ARGUMENT_ONLY_SUPPORTED_BY_TEST_HELPER"
      );
    }else{
      throw new TunnelReplicaObserverError("INVALID_ARGUMENT");
    }
  }

  if(
    !Number.isInteger(timeoutMs)||
    timeoutMs<250||
    timeoutMs>30000
  ){
    throw new TunnelReplicaObserverError("INVALID_TIMEOUT");
  }

  const endpoints=Object.keys(cliEndpoints).length>0
    ?cliEndpoints
    :parseEndpointsEnv(env.VIEWS_TUNNEL_METRICS_ENDPOINTS_JSON);

  if(Object.keys(endpoints).length<2){
    throw new TunnelReplicaObserverError("TUNNEL_METRICS_ENDPOINTS_REQUIRED");
  }

  return {endpoints,minConnections,timeoutMs};
}

function parseEndpointsEnv(raw){
  if(!String(raw??"").trim())return {};

  let parsed;
  try{
    parsed=JSON.parse(raw);
  }catch{
    throw new TunnelReplicaObserverError("INVALID_ENDPOINTS_JSON");
  }

  if(!parsed||typeof parsed!=="object"||Array.isArray(parsed)){
    throw new TunnelReplicaObserverError("INVALID_ENDPOINTS_JSON");
  }

  const result={};
  for(const [name,url] of Object.entries(parsed)){
    validateEndpoint(name,String(url));
    result[name]=String(url);
  }
  return result;
}

function validateEndpoint(name,url){
  if(!/^cloudflared-[a-z0-9][a-z0-9-]*$/.test(name)){
    throw new TunnelReplicaObserverError("INVALID_REPLICA_NAME");
  }
  let parsed;
  try{
    parsed=new URL(url);
  }catch{
    throw new TunnelReplicaObserverError("INVALID_METRICS_ENDPOINT");
  }
  if(!["http:","https:"].includes(parsed.protocol)){
    throw new TunnelReplicaObserverError("INVALID_METRICS_ENDPOINT");
  }
  if(parsed.username||parsed.password){
    throw new TunnelReplicaObserverError("METRICS_ENDPOINT_CREDENTIALS_FORBIDDEN");
  }
  if(parsed.pathname!=="/metrics"){
    throw new TunnelReplicaObserverError("INVALID_METRICS_ENDPOINT");
  }
}

function numberMetric(metrics,name,fallback=null){
  if(!metrics||typeof metrics!=="object"){
    if(fallback!==null)return fallback;
    throw new TunnelReplicaObserverError("INVALID_METRICS");
  }
  const value=Number(metrics[name]);
  if(!Number.isFinite(value)){
    if(fallback!==null)return fallback;
    return 0;
  }
  return value;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  runTunnelReplicaObserver().then(
    code=>{process.exitCode=code},
    error=>{
      const code=error instanceof TunnelReplicaObserverError
        ?error.code
        :"TUNNEL_REPLICA_OBSERVER_ERROR";
      process.stderr.write(JSON.stringify({ok:false,error:code})+"\n");
      process.exitCode=2;
    }
  );
}
