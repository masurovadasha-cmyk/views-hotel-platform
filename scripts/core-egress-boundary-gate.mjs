import {readFile} from "node:fs/promises";
import {pathToFileURL} from "node:url";

export class CoreEgressBoundaryError extends Error{
  constructor(code){
    super(code);
    this.name="CoreEgressBoundaryError";
    this.code=code;
  }
}

export function evaluateCoreEgressBoundary(model){
  assertObject(model,"INVALID_COMPOSE_MODEL");
  assertObject(model.services,"INVALID_COMPOSE_MODEL");
  assertObject(model.networks,"INVALID_COMPOSE_MODEL");

  const core=requiredService(model.services,"core");
  const blockers=[];

  if(core.network_mode){
    add(blockers,{code:"CORE_NETWORK_MODE_FORBIDDEN"});
  }

  if(Array.isArray(core.extra_hosts)&&core.extra_hosts.length>0){
    add(blockers,{code:"CORE_EXTRA_HOSTS_FORBIDDEN"});
  }else if(
    core.extra_hosts&&
    typeof core.extra_hosts==="object"&&
    Object.keys(core.extra_hosts).length>0
  ){
    add(blockers,{code:"CORE_EXTRA_HOSTS_FORBIDDEN"});
  }

  const coreNetworks=networkNames(core.networks);
  if(!coreNetworks.includes("core_egress")){
    add(blockers,{code:"CORE_EGRESS_NETWORK_REQUIRED"});
  }

  const networkPosture={};
  for(const name of coreNetworks){
    const network=model.networks[name];
    if(!network||typeof network!=="object"){
      add(blockers,{code:"CORE_NETWORK_DEFINITION_MISSING",network:name});
      networkPosture[name]={internal:false};
      continue;
    }

    const internal=network.internal===true;
    networkPosture[name]={internal};
    if(!internal){
      add(blockers,{code:"CORE_EXTERNAL_NETWORK_FORBIDDEN",network:name});
    }
  }

  const egressMembers=membersOfNetwork(model.services,"core_egress");
  if(
    egressMembers.length!==1||
    egressMembers[0]!=="core"
  ){
    add(blockers,{
      code:"CORE_EGRESS_NETWORK_MEMBERSHIP_INVALID",
      members:egressMembers
    });
  }

  const egressNetwork=model.networks.core_egress;
  if(!egressNetwork||egressNetwork.internal!==true){
    add(blockers,{code:"CORE_EGRESS_NETWORK_MUST_BE_INTERNAL"});
  }

  return {
    ok:blockers.length===0,
    schemaVersion:1,
    mode:"default_deny",
    coreNetworks,
    networkPosture,
    egressMembers,
    blockers
  };
}

export async function runCoreEgressBoundaryGate(
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
    throw new CoreEgressBoundaryError("INVALID_COMPOSE_JSON");
  }

  const result=evaluateCoreEgressBoundary(model);
  output.write(JSON.stringify(result)+"\n");
  return result.ok?0:1;
}

function parseArgs(argv){
  const options={file:null};
  for(const arg of argv){
    if(arg.startsWith("--file=")){
      const value=arg.slice("--file=".length).trim();
      if(!value)throw new CoreEgressBoundaryError("INVALID_ARGUMENT");
      options.file=value;
    }else{
      throw new CoreEgressBoundaryError("INVALID_ARGUMENT");
    }
  }
  return options;
}

async function readStream(stream){
  let value="";
  for await(const chunk of stream)value+=chunk.toString();
  if(!value.trim()){
    throw new CoreEgressBoundaryError("COMPOSE_INPUT_REQUIRED");
  }
  return value;
}

function requiredService(services,name){
  const service=services[name];
  assertObject(service,"REQUIRED_SERVICE_MISSING");
  return service;
}

function networkNames(value){
  if(Array.isArray(value))return value.map(String).sort();
  if(value&&typeof value==="object")return Object.keys(value).sort();
  return [];
}

function membersOfNetwork(services,networkName){
  return Object.entries(services)
    .filter(([,service])=>networkNames(service.networks).includes(networkName))
    .map(([name])=>name)
    .sort();
}

function assertObject(value,code){
  if(!value||typeof value!=="object"||Array.isArray(value)){
    throw new CoreEgressBoundaryError(code);
  }
}

function add(target,finding){
  const key=JSON.stringify(finding);
  if(!target.some(item=>JSON.stringify(item)===key))target.push(finding);
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  runCoreEgressBoundaryGate().then(
    code=>{process.exitCode=code},
    error=>{
      const code=error instanceof CoreEgressBoundaryError
        ?error.code
        :"CORE_EGRESS_BOUNDARY_ERROR";
      process.stderr.write(JSON.stringify({ok:false,error:code})+"\n");
      process.exitCode=2;
    }
  );
}
