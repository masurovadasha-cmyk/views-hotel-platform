import {isIP} from "node:net";
import {readFile} from "node:fs/promises";
import {pathToFileURL} from "node:url";

export class CoreOriginIsolationGateError extends Error{
  constructor(code){
    super(code);
    this.name="CoreOriginIsolationGateError";
    this.code=code;
  }
}

export function evaluateCoreOriginIsolation(model){
  assertObject(model,"INVALID_COMPOSE_MODEL");
  assertObject(model.services,"INVALID_COMPOSE_MODEL");
  assertObject(model.networks,"INVALID_COMPOSE_MODEL");

  const services=model.services;
  const core=requiredService(services,"core");
  const connector=requiredService(services,"cloudflared");
  const blockers=[];

  for(const name of ["core","cloudflared","postgres"]){
    const service=services[name];
    if(service&&publishedPorts(service).length>0){
      add(blockers,{code:"HOST_PORT_PUBLISHED",service:name});
    }
  }

  for(const [name,service] of [["core",core],["cloudflared",connector]]){
    if(service.network_mode==="host"){
      add(blockers,{code:"HOST_NETWORK_FORBIDDEN",service:name});
    }
    if(service.privileged===true){
      add(blockers,{code:"PRIVILEGED_CONTAINER_FORBIDDEN",service:name});
    }
    if(service.read_only!==true){
      add(blockers,{code:"READ_ONLY_ROOTFS_REQUIRED",service:name});
    }
    if(!list(service.cap_drop).includes("ALL")){
      add(blockers,{code:"DROP_ALL_CAPABILITIES_REQUIRED",service:name});
    }
    if(!hasNoNewPrivileges(service.security_opt)){
      add(blockers,{code:"NO_NEW_PRIVILEGES_REQUIRED",service:name});
    }
  }

  const ingress=model.networks.core_ingress;
  if(!ingress||ingress.internal!==true){
    add(blockers,{code:"PRIVATE_INGRESS_NETWORK_REQUIRED",service:null});
  }

  const coreNetworks=networkEntries(core.networks);
  const connectorNetworks=networkEntries(connector.networks);
  if(!coreNetworks.has("core_ingress")||!connectorNetworks.has("core_ingress")){
    add(blockers,{code:"CORE_CONNECTOR_SHARED_INGRESS_REQUIRED",service:null});
  }

  const ingressMembers=Object.entries(services)
    .filter(([,service])=>networkEntries(service.networks).has("core_ingress"))
    .map(([name])=>name)
    .sort();
  if(
    ingressMembers.length!==2||
    ingressMembers[0]!=="cloudflared"||
    ingressMembers[1]!=="core"
  ){
    add(blockers,{code:"INGRESS_NETWORK_MEMBERSHIP_INVALID",service:null});
  }

  const connectorIp=networkIpv4(connector.networks,"core_ingress");
  const coreIp=networkIpv4(core.networks,"core_ingress");
  if(!connectorIp||isIP(connectorIp)!==4){
    add(blockers,{code:"CONNECTOR_STATIC_IP_REQUIRED",service:"cloudflared"});
  }
  if(!coreIp||isIP(coreIp)!==4||coreIp===connectorIp){
    add(blockers,{code:"CORE_STATIC_IP_REQUIRED",service:"core"});
  }

  const coreEnv=environmentMap(core.environment);
  if(coreEnv.TRUSTED_PROXY_MODE!=="cloudflare_tunnel"){
    add(blockers,{code:"TUNNEL_PROXY_MODE_REQUIRED",service:"core"});
  }

  const configured=parseCidrs(
    coreEnv.VIEWS_TRUSTED_PROXY_CIDRS_JSON,
    blockers
  );
  if(connectorIp){
    const expected=connectorIp+"/32";
    if(configured.length!==1||configured[0]!==expected){
      add(blockers,{code:"CONNECTOR_TRUST_PIN_MISMATCH",service:"core"});
    }
  }

  const connectorCommand=list(connector.command).join(" ");
  if(!/\btunnel\b/.test(connectorCommand)||!/\brun\b/.test(connectorCommand)){
    add(blockers,{code:"TUNNEL_RUN_COMMAND_REQUIRED",service:"cloudflared"});
  }
  if(!connectorCommand.includes("--no-autoupdate")){
    add(blockers,{code:"TUNNEL_NO_AUTOUPDATE_REQUIRED",service:"cloudflared"});
  }
  if(connectorCommand.includes("--token")){
    add(blockers,{code:"TUNNEL_TOKEN_MUST_NOT_BE_IN_PROCESS_ARGS",service:"cloudflared"});
  }

  const connectorEnv=environmentMap(connector.environment);
  if(!connectorEnv.TUNNEL_TOKEN){
    add(blockers,{code:"TUNNEL_TOKEN_ENV_REQUIRED",service:"cloudflared"});
  }

  const connectorImage=String(connector.image||"");
  if(!connectorImage.startsWith("cloudflare/cloudflared:")){
    add(blockers,{code:"CLOUDFLARED_IMAGE_REQUIRED",service:"cloudflared"});
  }

  if(!connectorNetworks.has("tunnel_egress")){
    add(blockers,{code:"TUNNEL_EGRESS_NETWORK_REQUIRED",service:"cloudflared"});
  }else if(model.networks.tunnel_egress?.internal===true){
    add(blockers,{code:"TUNNEL_EGRESS_MUST_ALLOW_OUTBOUND",service:"cloudflared"});
  }

  return {
    ok:blockers.length===0,
    schemaVersion:1,
    mode:"cloudflare_tunnel",
    connectorIp:connectorIp||null,
    coreIp:coreIp||null,
    ingressMembers,
    blockers
  };
}

export async function runCoreOriginIsolationGate(
  argv=process.argv.slice(2),
  input=process.stdin,
  output=process.stdout
){
  const options=parseArgs(argv);
  const raw=options.file
    ?await readFile(options.file,"utf8")
    :await readStream(input);

  let model;
  try{
    model=JSON.parse(raw);
  }catch{
    throw new CoreOriginIsolationGateError("INVALID_COMPOSE_JSON");
  }

  const result=evaluateCoreOriginIsolation(model);
  output.write(JSON.stringify(result)+"\n");
  return result.ok?0:1;
}

function parseArgs(argv){
  const options={file:null};
  for(const arg of argv){
    if(arg.startsWith("--file=")){
      const value=arg.slice("--file=".length).trim();
      if(!value)throw new CoreOriginIsolationGateError("INVALID_ARGUMENT");
      options.file=value;
    }else{
      throw new CoreOriginIsolationGateError("INVALID_ARGUMENT");
    }
  }
  return options;
}

async function readStream(stream){
  let value="";
  for await(const chunk of stream)value+=chunk.toString();
  if(!value.trim()){
    throw new CoreOriginIsolationGateError("COMPOSE_INPUT_REQUIRED");
  }
  return value;
}

function requiredService(services,name){
  const service=services[name];
  assertObject(service,"REQUIRED_SERVICE_MISSING");
  return service;
}

function publishedPorts(service){
  return Array.isArray(service.ports)?service.ports:[];
}

function networkEntries(value){
  if(Array.isArray(value))return new Map(value.map(name=>[String(name),{}]));
  if(value&&typeof value==="object")return new Map(Object.entries(value));
  return new Map();
}

function networkIpv4(value,name){
  const entry=networkEntries(value).get(name);
  if(!entry||typeof entry!=="object")return null;
  const ip=String(entry.ipv4_address||"").trim();
  return ip||null;
}

function environmentMap(value){
  if(!value)return {};
  if(Array.isArray(value)){
    return Object.fromEntries(value.map(item=>{
      const raw=String(item);
      const index=raw.indexOf("=");
      return index<0?[raw,""]:[raw.slice(0,index),raw.slice(index+1)];
    }));
  }
  return typeof value==="object"?value:{};
}

function parseCidrs(raw,blockers){
  if(typeof raw!=="string"||!raw.trim()){
    add(blockers,{code:"CONNECTOR_TRUST_PIN_MISSING",service:"core"});
    return [];
  }
  try{
    const parsed=JSON.parse(raw);
    if(
      !Array.isArray(parsed)||
      parsed.some(value=>typeof value!=="string")
    ){
      throw new Error("invalid");
    }
    return parsed.map(value=>value.trim()).sort();
  }catch{
    add(blockers,{code:"CONNECTOR_TRUST_PIN_INVALID",service:"core"});
    return [];
  }
}

function hasNoNewPrivileges(value){
  return list(value).some(item=>{
    const normalized=String(item).replace(/=/g,":").toLowerCase();
    return normalized==="no-new-privileges:true";
  });
}

function list(value){
  if(Array.isArray(value))return value.map(item=>String(item));
  if(value===undefined||value===null)return [];
  return [String(value)];
}

function assertObject(value,code){
  if(!value||typeof value!=="object"||Array.isArray(value)){
    throw new CoreOriginIsolationGateError(code);
  }
}

function add(target,finding){
  const key=JSON.stringify(finding);
  if(!target.some(item=>JSON.stringify(item)===key))target.push(finding);
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  runCoreOriginIsolationGate().then(
    code=>{process.exitCode=code},
    error=>{
      const code=error instanceof CoreOriginIsolationGateError
        ?error.code
        :"CORE_ORIGIN_ISOLATION_GATE_ERROR";
      process.stderr.write(JSON.stringify({ok:false,error:code})+"\n");
      process.exitCode=2;
    }
  );
}
