import {readFile} from "node:fs/promises";
import {pathToFileURL} from "node:url";

const SERVICE_ID=/^[a-z0-9][a-z0-9._:-]{1,63}$/;
const BLOCKING_ALERTS=new Map([
  ["LEGACY_INTERNAL_KEY_TRAFFIC","LEGACY_TRAFFIC_PRESENT"],
  ["SIGNED_SERVICE_TRAFFIC_MISSING","SIGNED_TRAFFIC_MISSING"],
  ["SIGNED_CREDENTIAL_ROTATION_OVERDUE","SIGNING_CREDENTIAL_OVERDUE"],
  ["SIGNED_CREDENTIAL_ROTATION_METADATA_MISSING","SIGNING_CREDENTIAL_METADATA_MISSING"]
]);

export class ServiceCutoverGateError extends Error{
  constructor(code){
    super(code);
    this.name="ServiceCutoverGateError";
    this.code=code;
  }
}

export function evaluateServiceCutoverPosture(
  snapshot,
  {expectedServices=[],allowDueSoon=false}={}
){
  assertObject(snapshot);
  if(snapshot.schemaVersion!==1){
    throw new ServiceCutoverGateError("UNSUPPORTED_POSTURE_SCHEMA");
  }
  assertObject(snapshot.migration);
  if(!Array.isArray(snapshot.migration.services)){
    throw new ServiceCutoverGateError("INVALID_POSTURE_SNAPSHOT");
  }
  if(!Array.isArray(snapshot.credentials)||!Array.isArray(snapshot.alerts)){
    throw new ServiceCutoverGateError("INVALID_POSTURE_SNAPSHOT");
  }

  const blockers=[];
  const warnings=[];
  const services=new Map();

  for(const raw of snapshot.migration.services){
    assertObject(raw);
    const serviceId=serviceIdValue(raw.serviceId);
    const signedRequestCount=safeCount(raw.signedRequestCount);
    const legacyRequestCount=safeCount(raw.legacyRequestCount);
    services.set(serviceId,{signedRequestCount,legacyRequestCount});

    if(signedRequestCount<1){
      add(blockers,{code:"SIGNED_TRAFFIC_MISSING",serviceId,credentialId:null});
    }
    if(legacyRequestCount>0){
      add(blockers,{code:"LEGACY_TRAFFIC_PRESENT",serviceId,credentialId:null});
    }
    if(raw.ready!==true){
      add(blockers,{code:"SERVICE_NOT_READY",serviceId,credentialId:null});
    }
  }

  if(snapshot.migration.ready!==true){
    add(blockers,{code:"MIGRATION_NOT_READY",serviceId:null,credentialId:null});
  }

  const expected=normalizeExpectedServices(expectedServices);
  for(const serviceId of expected){
    if(!services.has(serviceId)){
      add(blockers,{code:"EXPECTED_SERVICE_MISSING",serviceId,credentialId:null});
    }
  }

  const credentialTraffic=new Map();
  const credentialServices=new Set();

  for(const raw of snapshot.credentials){
    assertObject(raw);
    const serviceId=serviceIdValue(raw.serviceId);
    const credentialId=credentialIdValue(raw.credentialId);
    assertObject(raw.observed);
    const requestCount=safeCount(raw.observed.requestCount);
    credentialServices.add(serviceId);
    credentialTraffic.set(
      serviceId,
      (credentialTraffic.get(serviceId)??0)+requestCount
    );

    if(raw.status==="overdue"){
      add(blockers,{
        code:"SIGNING_CREDENTIAL_OVERDUE",serviceId,credentialId
      });
    }else if(raw.status==="metadata_missing"){
      add(blockers,{
        code:"SIGNING_CREDENTIAL_METADATA_MISSING",serviceId,credentialId
      });
    }else if(raw.status==="due_soon"){
      const finding={
        code:"SIGNING_CREDENTIAL_DUE_SOON",serviceId,credentialId
      };
      add(allowDueSoon?warnings:blockers,finding);
    }else if(raw.status!=="healthy"){
      throw new ServiceCutoverGateError("INVALID_POSTURE_SNAPSHOT");
    }
  }

  for(const serviceId of services.keys()){
    if(!credentialServices.has(serviceId)){
      add(blockers,{
        code:"SIGNING_CREDENTIAL_MISSING",serviceId,credentialId:null
      });
    }else if((credentialTraffic.get(serviceId)??0)<1){
      add(blockers,{
        code:"CONFIGURED_SIGNING_CREDENTIAL_TRAFFIC_MISSING",
        serviceId,
        credentialId:null
      });
    }
  }

  for(const raw of snapshot.alerts){
    assertObject(raw);
    const code=typeof raw.code==="string"?raw.code:"";
    const mapped=BLOCKING_ALERTS.get(code);
    if(mapped){
      add(blockers,{
        code:mapped,
        serviceId:nullableServiceId(raw.serviceId),
        credentialId:nullableCredentialId(raw.credentialId)
      });
    }else if(code==="SIGNED_CREDENTIAL_ROTATION_DUE_SOON"){
      const finding={
        code:"SIGNING_CREDENTIAL_DUE_SOON",
        serviceId:nullableServiceId(raw.serviceId),
        credentialId:nullableCredentialId(raw.credentialId)
      };
      add(allowDueSoon?warnings:blockers,finding);
    }
  }

  const observedServices=[...services.keys()].sort();
  return {
    ok:blockers.length===0,
    schemaVersion:1,
    expectedServices:expected,
    observedServices,
    blockers,
    warnings
  };
}

export async function runServiceCutoverGate(
  argv=process.argv.slice(2),
  input=process.stdin
){
  const options=parseArgs(argv);
  const raw=options.file
    ?await readFile(options.file,"utf8")
    :await readStream(input);

  let snapshot;
  try{
    snapshot=JSON.parse(raw);
  }catch{
    throw new ServiceCutoverGateError("INVALID_POSTURE_JSON");
  }

  const result=evaluateServiceCutoverPosture(snapshot,{
    expectedServices:options.expectedServices,
    allowDueSoon:options.allowDueSoon
  });
  process.stdout.write(JSON.stringify(result)+"\n");
  return result.ok?0:1;
}

function parseArgs(argv){
  const result={file:null,expectedServices:[],allowDueSoon:false};
  for(const arg of argv){
    if(arg.startsWith("--file=")){
      result.file=arg.slice("--file=".length).trim();
      if(!result.file)throw new ServiceCutoverGateError("INVALID_ARGUMENT");
    }else if(arg.startsWith("--expect=")){
      result.expectedServices=arg.slice("--expect=".length)
        .split(",").map(value=>value.trim()).filter(Boolean);
    }else if(arg==="--allow-due-soon"){
      result.allowDueSoon=true;
    }else{
      throw new ServiceCutoverGateError("INVALID_ARGUMENT");
    }
  }
  return result;
}

async function readStream(stream){
  let value="";
  for await(const chunk of stream)value+=chunk.toString();
  if(!value.trim())throw new ServiceCutoverGateError("POSTURE_INPUT_REQUIRED");
  return value;
}

function normalizeExpectedServices(values){
  return [...new Set(values.map(serviceIdValue))].sort();
}

function safeCount(value){
  const count=Number(value);
  if(!Number.isSafeInteger(count)||count<0){
    throw new ServiceCutoverGateError("INVALID_POSTURE_SNAPSHOT");
  }
  return count;
}

function serviceIdValue(value){
  const id=String(value??"").trim();
  if(!SERVICE_ID.test(id)){
    throw new ServiceCutoverGateError("INVALID_POSTURE_SNAPSHOT");
  }
  return id;
}

function credentialIdValue(value){
  const id=String(value??"").trim();
  if(!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/.test(id)){
    throw new ServiceCutoverGateError("INVALID_POSTURE_SNAPSHOT");
  }
  return id;
}

function nullableServiceId(value){
  return value===null||value===undefined?null:serviceIdValue(value);
}

function nullableCredentialId(value){
  return value===null||value===undefined?null:credentialIdValue(value);
}

function assertObject(value){
  if(!value||typeof value!=="object"||Array.isArray(value)){
    throw new ServiceCutoverGateError("INVALID_POSTURE_SNAPSHOT");
  }
}

function add(target,finding){
  const key=JSON.stringify(finding);
  if(!target.some(item=>JSON.stringify(item)===key))target.push(finding);
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  runServiceCutoverGate().then(
    code=>{process.exitCode=code},
    error=>{
      const code=error instanceof ServiceCutoverGateError
        ?error.code
        :"SERVICE_CUTOVER_GATE_ERROR";
      process.stderr.write(JSON.stringify({ok:false,error:code})+"\n");
      process.exitCode=2;
    }
  );
}
