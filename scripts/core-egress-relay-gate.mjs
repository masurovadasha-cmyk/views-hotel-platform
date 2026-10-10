import {readFile} from "node:fs/promises";
import {pathToFileURL} from "node:url";

const RELAY="egress-relay";
const CORE="core";

export class CoreEgressRelayError extends Error{
  constructor(code){
    super(code);
    this.name="CoreEgressRelayError";
    this.code=code;
  }
}

export function evaluateCoreEgressRelay(model){
  assertObject(model,"INVALID_COMPOSE_MODEL");
  assertObject(model.services,"INVALID_COMPOSE_MODEL");
  assertObject(model.networks,"INVALID_COMPOSE_MODEL");

  const core=required(model.services,CORE);
  const relay=required(model.services,RELAY);
  const blockers=[];

  const coreNetworks=networkNames(core.networks);
  const relayNetworks=networkNames(relay.networks);
  const privateMembers=members(model.services,"core_egress");
  const publicMembers=members(model.services,"egress_public");

  if(
    JSON.stringify(privateMembers)!==
    JSON.stringify([CORE,RELAY].sort())
  ){
    add(blockers,{
      code:"EGRESS_PRIVATE_MEMBERSHIP_INVALID",
      members:privateMembers
    });
  }

  if(
    publicMembers.length!==1||
    publicMembers[0]!==RELAY
  ){
    add(blockers,{
      code:"EGRESS_PUBLIC_MEMBERSHIP_INVALID",
      members:publicMembers
    });
  }

  if(model.networks.core_egress?.internal!==true){
    add(blockers,{code:"EGRESS_PRIVATE_NETWORK_MUST_BE_INTERNAL"});
  }
  if(model.networks.egress_public?.internal===true){
    add(blockers,{code:"EGRESS_PUBLIC_NETWORK_MUST_ALLOW_OUTBOUND"});
  }

  if(coreNetworks.includes("egress_public")){
    add(blockers,{code:"CORE_PUBLIC_EGRESS_FORBIDDEN"});
  }

  const requiredRelayNetworks=["core_egress","egress_public"];
  if(
    JSON.stringify(relayNetworks)!==
    JSON.stringify(requiredRelayNetworks.sort())
  ){
    add(blockers,{
      code:"EGRESS_RELAY_NETWORK_SCOPE_INVALID",
      networks:relayNetworks
    });
  }

  const coreIp=networkIpv4(core.networks,"core_egress");
  const relayIp=networkIpv4(relay.networks,"core_egress");
  if(coreIp!=="172.31.0.2"){
    add(blockers,{code:"CORE_EGRESS_IP_PIN_INVALID"});
  }
  if(relayIp!=="172.31.0.3"){
    add(blockers,{code:"EGRESS_RELAY_IP_PIN_INVALID"});
  }

  if(Array.isArray(relay.ports)&&relay.ports.length){
    add(blockers,{code:"EGRESS_RELAY_HOST_PORT_FORBIDDEN"});
  }
  if(relay.network_mode){
    add(blockers,{code:"EGRESS_RELAY_HOST_NETWORK_FORBIDDEN"});
  }
  if(relay.privileged===true){
    add(blockers,{code:"EGRESS_RELAY_PRIVILEGED_FORBIDDEN"});
  }

  const image=String(relay.image||"");
  if(
    image!==
    "ubuntu/squid:6.6-24.04_beta@sha256:6a097f68bae708cedbabd6188d68c7e2e7a38cedd05a176e1cc0ba29e3bbe029"
  ){
    add(blockers,{code:"EGRESS_RELAY_IMAGE_NOT_PINNED"});
  }

  const volumes=volumeStrings(relay.volumes);
  if(!volumes.some(value=>
    value.includes("infra/egress/squid.conf:/etc/squid/squid.conf:ro")
  )){
    add(blockers,{code:"EGRESS_RELAY_CONFIG_MOUNT_REQUIRED"});
  }
  if(!volumes.some(value=>
    value.includes("infra/egress/allowed-domains.txt:/etc/squid/allowed-domains.txt:ro")
  )){
    add(blockers,{code:"EGRESS_RELAY_POLICY_MOUNT_REQUIRED"});
  }

  if(
    relay.security_opt&&
    !list(relay.security_opt).some(value=>
      String(value).replace(/=/g,":")==="no-new-privileges:true"
    )
  ){
    add(blockers,{code:"EGRESS_RELAY_NO_NEW_PRIVILEGES_REQUIRED"});
  }

  return {
    ok:blockers.length===0,
    schemaVersion:1,
    mode:"https_forward_proxy_allowlist",
    coreIp,
    relayIp,
    privateMembers,
    publicMembers,
    relayNetworks,
    blockers
  };
}

export async function runCoreEgressRelayGate(
  argv=process.argv.slice(2),
  input=process.stdin,
  output=process.stdout
){
  let file=null;
  for(const arg of argv){
    if(arg.startsWith("--file=")){
      file=arg.slice("--file=".length).trim();
      if(!file)throw new CoreEgressRelayError("INVALID_ARGUMENT");
    }else{
      throw new CoreEgressRelayError("INVALID_ARGUMENT");
    }
  }

  const raw=file?await readFile(file,"utf8"):await readStream(input);
  let model;
  try{model=JSON.parse(raw)}
  catch{throw new CoreEgressRelayError("INVALID_COMPOSE_JSON")}

  const result=evaluateCoreEgressRelay(model);
  output.write(JSON.stringify(result)+"\n");
  return result.ok?0:1;
}

function networkNames(value){
  if(Array.isArray(value))return value.map(String).sort();
  if(value&&typeof value==="object")return Object.keys(value).sort();
  return [];
}

function networkIpv4(value,name){
  if(!value||typeof value!=="object"||Array.isArray(value))return null;
  const entry=value[name];
  return entry&&typeof entry==="object"
    ?String(entry.ipv4_address||"").trim()||null
    :null;
}

function members(services,network){
  return Object.entries(services)
    .filter(([,service])=>networkNames(service.networks).includes(network))
    .map(([name])=>name)
    .sort();
}

function volumeStrings(value){
  if(!Array.isArray(value))return [];
  return value.map(item=>{
    if(typeof item==="string")return item;
    if(item&&typeof item==="object"){
      const source=String(item.source||"");
      const target=String(item.target||"");
      const ro=item.read_only===true?":ro":"";
      return source+":"+target+ro;
    }
    return "";
  });
}

function list(value){
  if(Array.isArray(value))return value;
  if(value===undefined||value===null)return [];
  return [value];
}

function required(services,name){
  const value=services[name];
  assertObject(value,"REQUIRED_SERVICE_MISSING");
  return value;
}

function assertObject(value,code){
  if(!value||typeof value!=="object"||Array.isArray(value)){
    throw new CoreEgressRelayError(code);
  }
}

function add(target,finding){
  const key=JSON.stringify(finding);
  if(!target.some(item=>JSON.stringify(item)===key))target.push(finding);
}

async function readStream(stream){
  let value="";
  for await(const chunk of stream)value+=chunk.toString();
  if(!value.trim())throw new CoreEgressRelayError("COMPOSE_INPUT_REQUIRED");
  return value;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  runCoreEgressRelayGate().then(
    code=>{process.exitCode=code},
    error=>{
      const code=error instanceof CoreEgressRelayError
        ?error.code
        :"CORE_EGRESS_RELAY_ERROR";
      process.stderr.write(JSON.stringify({ok:false,error:code})+"\n");
      process.exitCode=2;
    }
  );
}
