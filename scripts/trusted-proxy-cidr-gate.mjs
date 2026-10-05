import {BlockList,isIP} from "node:net";
import {readFile} from "node:fs/promises";
import {pathToFileURL} from "node:url";

const CLOUDFLARE_IPS_URL="https://api.cloudflare.com/client/v4/ips";

export class TrustedProxyCidrGateError extends Error{
  constructor(code){
    super(code);
    this.name="TrustedProxyCidrGateError";
    this.code=code;
  }
}

export function evaluateTrustedProxyCidrs(configuredCidrs,providerEnvelope){
  const configured=normalizeCidrs(
    configuredCidrs,
    "INVALID_CONFIGURED_CIDRS",
    128
  );
  const provider=providerRanges(providerEnvelope);

  const configuredSet=new Set(configured);
  const providerSet=new Set(provider.cidrs);

  const missingFromConfig=provider.cidrs
    .filter(range=>!configuredSet.has(range))
    .sort();
  const unexpectedInConfig=configured
    .filter(range=>!providerSet.has(range))
    .sort();

  const blockers=[
    ...missingFromConfig.map(cidr=>({
      code:"PROVIDER_RANGE_MISSING_FROM_CONFIG",
      cidr
    })),
    ...unexpectedInConfig.map(cidr=>({
      code:"CONFIG_RANGE_NOT_PUBLISHED_BY_PROVIDER",
      cidr
    }))
  ];

  return {
    ok:blockers.length===0,
    schemaVersion:1,
    provider:"cloudflare",
    providerEtag:provider.etag,
    configuredCount:configured.length,
    providerCount:provider.cidrs.length,
    missingFromConfig,
    unexpectedInConfig,
    blockers
  };
}

export async function fetchCloudflareIpRanges(fetchImpl=globalThis.fetch){
  if(typeof fetchImpl!=="function"){
    throw new TrustedProxyCidrGateError("FETCH_UNAVAILABLE");
  }

  let response;
  try{
    response=await fetchImpl(CLOUDFLARE_IPS_URL,{
      headers:{
        accept:"application/json",
        "user-agent":"views-hotel-platform-stage7.14"
      },
      signal:AbortSignal.timeout(10000)
    });
  }catch{
    throw new TrustedProxyCidrGateError("PROVIDER_FETCH_FAILED");
  }

  if(!response?.ok){
    throw new TrustedProxyCidrGateError("PROVIDER_FETCH_FAILED");
  }

  let payload;
  try{
    payload=await response.json();
  }catch{
    throw new TrustedProxyCidrGateError("INVALID_PROVIDER_RESPONSE");
  }

  providerRanges(payload);
  return payload;
}

export async function runTrustedProxyCidrGate(
  argv=process.argv.slice(2),
  env=process.env,
  output=process.stdout
){
  const options=parseArgs(argv);
  const configured=parseConfiguredCidrs(
    env.VIEWS_TRUSTED_PROXY_CIDRS_JSON
  );

  let providerEnvelope;
  if(options.providerFile){
    let raw;
    try{
      raw=await readFile(options.providerFile,"utf8");
    }catch{
      throw new TrustedProxyCidrGateError("PROVIDER_FILE_UNREADABLE");
    }
    try{
      providerEnvelope=JSON.parse(raw);
    }catch{
      throw new TrustedProxyCidrGateError("INVALID_PROVIDER_RESPONSE");
    }
  }else{
    providerEnvelope=await fetchCloudflareIpRanges();
  }

  const result=evaluateTrustedProxyCidrs(configured,providerEnvelope);
  output.write(JSON.stringify(result)+"\n");
  return result.ok?0:1;
}

function parseArgs(argv){
  const result={providerFile:null};
  for(const arg of argv){
    if(arg.startsWith("--provider-file=")){
      const value=arg.slice("--provider-file=".length).trim();
      if(!value){
        throw new TrustedProxyCidrGateError("INVALID_ARGUMENT");
      }
      result.providerFile=value;
    }else{
      throw new TrustedProxyCidrGateError("INVALID_ARGUMENT");
    }
  }
  return result;
}

function parseConfiguredCidrs(raw){
  const value=String(raw??"").trim();
  if(!value){
    throw new TrustedProxyCidrGateError(
      "VIEWS_TRUSTED_PROXY_CIDRS_JSON_REQUIRED"
    );
  }

  let parsed;
  try{
    parsed=JSON.parse(value);
  }catch{
    throw new TrustedProxyCidrGateError("INVALID_CONFIGURED_CIDRS");
  }
  return normalizeCidrs(parsed,"INVALID_CONFIGURED_CIDRS",128);
}

function providerRanges(envelope){
  if(!envelope||typeof envelope!=="object"||Array.isArray(envelope)){
    throw new TrustedProxyCidrGateError("INVALID_PROVIDER_RESPONSE");
  }
  if(envelope.success!==true){
    throw new TrustedProxyCidrGateError("INVALID_PROVIDER_RESPONSE");
  }
  const result=envelope.result;
  if(!result||typeof result!=="object"||Array.isArray(result)){
    throw new TrustedProxyCidrGateError("INVALID_PROVIDER_RESPONSE");
  }

  const ipv4=normalizeCidrs(
    result.ipv4_cidrs,
    "INVALID_PROVIDER_RESPONSE",
    128
  );
  const ipv6=normalizeCidrs(
    result.ipv6_cidrs,
    "INVALID_PROVIDER_RESPONSE",
    128
  );
  if(ipv4.length===0||ipv6.length===0){
    throw new TrustedProxyCidrGateError("INVALID_PROVIDER_RESPONSE");
  }

  for(const cidr of ipv4){
    if(cidrFamily(cidr)!==4){
      throw new TrustedProxyCidrGateError("INVALID_PROVIDER_RESPONSE");
    }
  }
  for(const cidr of ipv6){
    if(cidrFamily(cidr)!==6){
      throw new TrustedProxyCidrGateError("INVALID_PROVIDER_RESPONSE");
    }
  }

  const cidrs=[...new Set([...ipv4,...ipv6])].sort();
  if(cidrs.length!==ipv4.length+ipv6.length){
    throw new TrustedProxyCidrGateError("INVALID_PROVIDER_RESPONSE");
  }

  const etag=typeof result.etag==="string"&&result.etag.trim()
    ?result.etag.trim()
    :null;

  return {cidrs,etag};
}

function normalizeCidrs(value,errorCode,max){
  if(!Array.isArray(value)||value.length<1||value.length>max){
    throw new TrustedProxyCidrGateError(errorCode);
  }

  const result=[];
  for(const raw of value){
    if(typeof raw!=="string"||!raw.trim()){
      throw new TrustedProxyCidrGateError(errorCode);
    }
    const cidr=raw.trim();
    validateCidr(cidr,errorCode);
    if(result.includes(cidr)){
      throw new TrustedProxyCidrGateError(errorCode);
    }
    result.push(cidr);
  }
  return result.sort();
}

function validateCidr(value,errorCode){
  const parts=value.split("/");
  if(parts.length!==2){
    throw new TrustedProxyCidrGateError(errorCode);
  }
  const address=parts[0];
  const version=isIP(address);
  const prefix=Number(parts[1]);
  const maxPrefix=version===4?32:version===6?128:0;
  if(
    !version||
    !Number.isInteger(prefix)||
    prefix<0||
    prefix>maxPrefix
  ){
    throw new TrustedProxyCidrGateError(errorCode);
  }

  try{
    const block=new BlockList();
    block.addSubnet(
      address,
      prefix,
      version===4?"ipv4":"ipv6"
    );
  }catch{
    throw new TrustedProxyCidrGateError(errorCode);
  }
}

function cidrFamily(value){
  return isIP(value.split("/")[0]);
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  runTrustedProxyCidrGate().then(
    code=>{process.exitCode=code},
    error=>{
      const code=error instanceof TrustedProxyCidrGateError
        ?error.code
        :"TRUSTED_PROXY_CIDR_GATE_ERROR";
      process.stderr.write(JSON.stringify({ok:false,error:code})+"\n");
      process.exitCode=2;
    }
  );
}
