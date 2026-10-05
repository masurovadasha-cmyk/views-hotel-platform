import {createHash,createPublicKey} from "node:crypto";
import {validateNetworkRange} from "./security/network-cidr";

export type TrustedProxyMode="direct"|"cloudflare";
export type InternalServiceAuthMode="internal_key_only"|"dual"|"signed_only";

export type ConfiguredInternalServicePublicKey={
  kid:string;
  publicKeyPem:string;
  activatedAt:string|null;
  rotateBy:string|null;
};

export type ApiConfig={
  port:number;
  databaseUrl:string;
  nodeEnv:"development"|"test"|"production";
  trustedProxyMode:TrustedProxyMode;
  guestAuthRateLimitSecret:string;
  internalApiKey:string;
  internalApiKeys:string[];
  internalServiceKeys:Record<string,string[]>;
  internalServicePublicKeys:Record<string,ConfiguredInternalServicePublicKey[]>;
  internalServiceAuthModes:Record<string,InternalServiceAuthMode>;
  trustedProxyCidrs:string[];
  internalServiceSourceCidrs:Record<string,string[]>;
};

const SERVICE_ID=/^[a-z0-9][a-z0-9._:-]{1,63}$/;
const SECRET_REF=/^[A-Z][A-Z0-9_]{2,127}$/;
const KID=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;

export function loadConfig(env:NodeJS.ProcessEnv=process.env):ApiConfig{
  const databaseUrl=env.DATABASE_URL?.trim();
  if(!databaseUrl)throw new Error("DATABASE_URL is required");

  const nodeEnv=(env.NODE_ENV||"development") as ApiConfig["nodeEnv"];
  if(!["development","test","production"].includes(nodeEnv))throw new Error("Invalid NODE_ENV");

  const port=Number(env.PORT||3001);
  if(!Number.isInteger(port)||port<1||port>65535)throw new Error("Invalid PORT");

  const trustedProxyMode=(env.TRUSTED_PROXY_MODE||"direct") as TrustedProxyMode;
  if(!["direct","cloudflare"].includes(trustedProxyMode)){
    throw new Error("Invalid TRUSTED_PROXY_MODE");
  }

  const configuredGuestSecret=env.GUEST_AUTH_RATE_LIMIT_SECRET?.trim();
  if(configuredGuestSecret&&configuredGuestSecret.length<32){
    throw new Error("GUEST_AUTH_RATE_LIMIT_SECRET must be at least 32 characters");
  }
  if(nodeEnv==="production"&&!configuredGuestSecret){
    throw new Error("GUEST_AUTH_RATE_LIMIT_SECRET is required in production");
  }
  const guestAuthRateLimitSecret=configuredGuestSecret
    ??"views-development-only-rate-limit-secret-not-for-production";

  const configuredInternalKey=env.VIEWS_INTERNAL_API_KEY?.trim();
  if(configuredInternalKey&&configuredInternalKey.length<32){
    throw new Error("VIEWS_INTERNAL_API_KEY must be at least 32 characters");
  }
  const internalApiKey=configuredInternalKey
    ??"views-development-only-internal-api-key-not-for-production";

  const configuredPreviousKey=env.VIEWS_INTERNAL_API_KEY_PREVIOUS?.trim();
  if(configuredPreviousKey&&configuredPreviousKey.length<32){
    throw new Error("VIEWS_INTERNAL_API_KEY_PREVIOUS must be at least 32 characters");
  }

  const internalApiKeys=[...new Set(
    [internalApiKey,configuredPreviousKey].filter((value):value is string=>Boolean(value))
  )];

  const serviceKeyRefs=parseInternalServiceKeyRefs(
    env.VIEWS_INTERNAL_SERVICE_KEY_REFS_JSON
  );
  const rawServiceKeys=parseInternalServiceKeys(
    env.VIEWS_INTERNAL_SERVICE_KEYS_JSON
  );

  if(Object.keys(serviceKeyRefs).length>0&&Object.keys(rawServiceKeys).length>0){
    throw new Error(
      "Configure either VIEWS_INTERNAL_SERVICE_KEY_REFS_JSON or VIEWS_INTERNAL_SERVICE_KEYS_JSON, not both"
    );
  }
  if(nodeEnv==="production"&&Object.keys(rawServiceKeys).length>0){
    throw new Error("VIEWS_INTERNAL_SERVICE_KEYS_JSON is not allowed in production");
  }
  const internalServiceKeys=Object.keys(serviceKeyRefs).length>0
    ?resolveInternalServiceKeyRefs(serviceKeyRefs,env)
    :rawServiceKeys;

  const servicePublicKeyRefs=parseInternalServicePublicKeyRefs(
    env.VIEWS_INTERNAL_SERVICE_PUBLIC_KEY_REFS_JSON,
    nodeEnv==="production"
  );
  const internalServicePublicKeys=resolveInternalServicePublicKeyRefs(
    servicePublicKeyRefs,env
  );
  const configuredAuthModes=parseInternalServiceAuthModes(
    env.VIEWS_INTERNAL_SERVICE_AUTH_MODES_JSON
  );
  const internalServiceAuthModes=resolveInternalServiceAuthModes(
    configuredAuthModes,
    internalServiceKeys,
    internalServicePublicKeys,
    nodeEnv
  );
  const trustedProxyCidrs=parseNetworkCidrs(
    env.VIEWS_TRUSTED_PROXY_CIDRS_JSON,
    "VIEWS_TRUSTED_PROXY_CIDRS_JSON"
  );
  const internalServiceSourceCidrs=parseInternalServiceSourceCidrs(
    env.VIEWS_INTERNAL_SERVICE_SOURCE_CIDRS_JSON
  );
  validateInternalIngressConfig(
    trustedProxyMode,
    trustedProxyCidrs,
    internalServiceSourceCidrs,
    internalServiceAuthModes,
    nodeEnv
  );

  return {
    port,databaseUrl,nodeEnv,trustedProxyMode,
    guestAuthRateLimitSecret,internalApiKey,internalApiKeys,
    internalServiceKeys,internalServicePublicKeys,internalServiceAuthModes,
    trustedProxyCidrs,internalServiceSourceCidrs
  };
}

function parseNetworkCidrs(raw:string|undefined,name:string){
  const value=raw?.trim();
  if(!value)return [] as string[];

  let parsed:unknown;
  try{
    parsed=JSON.parse(value);
  }catch{
    throw new Error(name+" must be valid JSON");
  }
  if(!Array.isArray(parsed)||parsed.length<1||parsed.length>128){
    throw new Error(name+" must be a non-empty array of CIDRs");
  }

  const result:string[]=[];
  for(const item of parsed){
    if(typeof item!=="string"||!item.trim()){
      throw new Error(name+" must contain only CIDR strings");
    }
    const range=item.trim();
    validateNetworkRange(range);
    if(!result.includes(range))result.push(range);
  }
  return result;
}

function parseInternalServiceSourceCidrs(raw:string|undefined){
  const value=raw?.trim();
  if(!value)return {} as Record<string,string[]>;

  let parsed:unknown;
  try{
    parsed=JSON.parse(value);
  }catch{
    throw new Error("VIEWS_INTERNAL_SERVICE_SOURCE_CIDRS_JSON must be valid JSON");
  }
  if(!parsed||typeof parsed!=="object"||Array.isArray(parsed)){
    throw new Error("VIEWS_INTERNAL_SERVICE_SOURCE_CIDRS_JSON must be an object");
  }

  const result:Record<string,string[]>={};
  for(const [serviceId,rawRanges] of Object.entries(parsed as Record<string,unknown>)){
    if(!SERVICE_ID.test(serviceId)){
      throw new Error("VIEWS_INTERNAL_SERVICE_SOURCE_CIDRS_JSON contains invalid service id");
    }
    if(!Array.isArray(rawRanges)||rawRanges.length<1||rawRanges.length>64){
      throw new Error(
        "VIEWS_INTERNAL_SERVICE_SOURCE_CIDRS_JSON service entry must contain 1..64 CIDRs"
      );
    }
    const ranges:string[]=[];
    for(const item of rawRanges){
      if(typeof item!=="string"||!item.trim()){
        throw new Error(
          "VIEWS_INTERNAL_SERVICE_SOURCE_CIDRS_JSON must contain only CIDR strings"
        );
      }
      const range=item.trim();
      validateNetworkRange(range);
      if(!ranges.includes(range))ranges.push(range);
    }
    result[serviceId]=ranges;
  }
  return result;
}

function validateInternalIngressConfig(
  proxyMode:TrustedProxyMode,
  trustedProxyCidrs:string[],
  sourceCidrs:Record<string,string[]>,
  authModes:Record<string,InternalServiceAuthMode>,
  nodeEnv:ApiConfig["nodeEnv"]
){
  if(nodeEnv!=="production")return;

  if(proxyMode==="cloudflare"&&trustedProxyCidrs.length===0){
    throw new Error(
      "VIEWS_TRUSTED_PROXY_CIDRS_JSON is required in cloudflare production mode"
    );
  }

  if(proxyMode==="direct"){
    for(const serviceId of Object.keys(authModes)){
      if(!sourceCidrs[serviceId]?.length){
        throw new Error(
          "VIEWS_INTERNAL_SERVICE_SOURCE_CIDRS_JSON must declare every direct-mode production service"
        );
      }
    }
  }

  for(const serviceId of Object.keys(sourceCidrs)){
    if(!authModes[serviceId]){
      throw new Error(
        "VIEWS_INTERNAL_SERVICE_SOURCE_CIDRS_JSON contains an unknown production service"
      );
    }
  }
}

function parseInternalServiceAuthModes(raw:string|undefined){
  const value=raw?.trim();
  if(!value)return {} as Record<string,InternalServiceAuthMode>;

  let parsed:unknown;
  try{
    parsed=JSON.parse(value);
  }catch{
    throw new Error("VIEWS_INTERNAL_SERVICE_AUTH_MODES_JSON must be valid JSON");
  }
  if(!parsed||typeof parsed!=="object"||Array.isArray(parsed)){
    throw new Error("VIEWS_INTERNAL_SERVICE_AUTH_MODES_JSON must be an object");
  }

  const result:Record<string,InternalServiceAuthMode>={};
  for(const [serviceId,mode] of Object.entries(parsed as Record<string,unknown>)){
    if(!SERVICE_ID.test(serviceId)){
      throw new Error("VIEWS_INTERNAL_SERVICE_AUTH_MODES_JSON contains invalid service id");
    }
    if(
      mode!=="internal_key_only"&&
      mode!=="dual"&&
      mode!=="signed_only"
    ){
      throw new Error("VIEWS_INTERNAL_SERVICE_AUTH_MODES_JSON contains invalid auth mode");
    }
    result[serviceId]=mode;
  }
  return result;
}

function resolveInternalServiceAuthModes(
  configured:Record<string,InternalServiceAuthMode>,
  serviceKeys:Record<string,string[]>,
  servicePublicKeys:Record<string,ConfiguredInternalServicePublicKey[]>,
  nodeEnv:ApiConfig["nodeEnv"]
){
  const known=[...new Set([
    ...Object.keys(serviceKeys),
    ...Object.keys(servicePublicKeys),
    ...Object.keys(configured)
  ])].sort();

  if(nodeEnv==="production"&&Object.keys(configured).length===0){
    throw new Error("VIEWS_INTERNAL_SERVICE_AUTH_MODES_JSON is required in production");
  }

  const result:Record<string,InternalServiceAuthMode>={};
  for(const serviceId of known){
    const mode=configured[serviceId]??(
      serviceKeys[serviceId]?.length&&servicePublicKeys[serviceId]?.length
        ?"dual"
        :servicePublicKeys[serviceId]?.length
          ?"signed_only"
          :"internal_key_only"
    );

    if(nodeEnv==="production"&&!configured[serviceId]){
      throw new Error(
        "VIEWS_INTERNAL_SERVICE_AUTH_MODES_JSON must declare every production service"
      );
    }

    const hasKey=Boolean(serviceKeys[serviceId]?.length);
    const hasPublicKey=Boolean(servicePublicKeys[serviceId]?.length);

    if(mode==="internal_key_only"&&!hasKey){
      throw new Error(
        "internal_key_only service requires a symmetric service key"
      );
    }
    if(mode==="dual"&&(!hasKey||!hasPublicKey)){
      throw new Error(
        "dual service requires symmetric and signing credentials"
      );
    }
    if(mode==="signed_only"&&!hasPublicKey){
      throw new Error(
        "signed_only service requires signing public keys"
      );
    }
    result[serviceId]=mode;
  }

  return result;
}

function parseInternalServiceKeyRefs(raw:string|undefined){
  const parsed=parseServiceMap(
    raw,
    "VIEWS_INTERNAL_SERVICE_KEY_REFS_JSON"
  );
  const result:Record<string,string[]>={};
  const owners=new Map<string,string>();

  for(const [serviceId,refsValue] of Object.entries(parsed)){
    if(!Array.isArray(refsValue)||refsValue.length<1||refsValue.length>2){
      throw new Error(
        "VIEWS_INTERNAL_SERVICE_KEY_REFS_JSON service key ring must contain 1 or 2 references"
      );
    }

    const refs:string[]=[];
    for(const item of refsValue){
      if(typeof item!=="string"||!SECRET_REF.test(item.trim())){
        throw new Error(
          "VIEWS_INTERNAL_SERVICE_KEY_REFS_JSON references must be environment variable names"
        );
      }
      const ref=item.trim();
      if(!refs.includes(ref))refs.push(ref);
    }

    for(const ref of refs){
      const owner=owners.get(ref);
      if(owner&&owner!==serviceId){
        throw new Error(
          "VIEWS_INTERNAL_SERVICE_KEY_REFS_JSON reference cannot be shared across services"
        );
      }
      owners.set(ref,serviceId);
    }
    result[serviceId]=refs;
  }

  return result;
}

function resolveInternalServiceKeyRefs(
  refs:Record<string,string[]>,
  env:NodeJS.ProcessEnv
){
  const result:Record<string,string[]>={};
  const owners=new Map<string,string>();

  for(const [serviceId,serviceRefs] of Object.entries(refs)){
    const keys:string[]=[];
    for(const ref of serviceRefs){
      const key=env[ref]?.trim();
      if(!key){
        throw new Error(
          "Referenced internal service key "+ref+" is required"
        );
      }
      if(key.length<32){
        throw new Error(
          "Referenced internal service key "+ref+" must be at least 32 characters"
        );
      }
      if(!keys.includes(key))keys.push(key);
    }

    for(const key of keys){
      const owner=owners.get(key);
      if(owner&&owner!==serviceId){
        throw new Error("Resolved internal service key cannot be shared across services");
      }
      owners.set(key,serviceId);
    }
    result[serviceId]=keys;
  }

  return result;
}

function parseInternalServicePublicKeyRefs(
  raw:string|undefined,
  requireRotationMetadata:boolean
){
  const parsed=parseServiceMap(
    raw,
    "VIEWS_INTERNAL_SERVICE_PUBLIC_KEY_REFS_JSON"
  );
  const result:Record<string,{
    kid:string;ref:string;activatedAt:string|null;rotateBy:string|null;
  }[]>={};
  const refOwners=new Map<string,string>();

  for(const [serviceId,value] of Object.entries(parsed)){
    if(!Array.isArray(value)||value.length<1||value.length>2){
      throw new Error(
        "VIEWS_INTERNAL_SERVICE_PUBLIC_KEY_REFS_JSON service ring must contain 1 or 2 keys"
      );
    }

    const entries:{
      kid:string;ref:string;activatedAt:string|null;rotateBy:string|null;
    }[]=[];
    const kids=new Set<string>();
    for(const rawEntry of value){
      if(!rawEntry||typeof rawEntry!=="object"||Array.isArray(rawEntry)){
        throw new Error(
          "VIEWS_INTERNAL_SERVICE_PUBLIC_KEY_REFS_JSON entries must be objects"
        );
      }
      const entry=rawEntry as Record<string,unknown>;
      const kid=typeof entry.kid==="string"?entry.kid.trim():"";
      const ref=typeof entry.ref==="string"?entry.ref.trim():"";
      if(!KID.test(kid)||!SECRET_REF.test(ref)){
        throw new Error(
          "VIEWS_INTERNAL_SERVICE_PUBLIC_KEY_REFS_JSON contains invalid kid or reference"
        );
      }

      const activatedAt=rotationTimestamp(
        entry.activatedAt,
        requireRotationMetadata,
        "activatedAt"
      );
      const rotateBy=rotationTimestamp(
        entry.rotateBy,
        requireRotationMetadata,
        "rotateBy"
      );
      if((activatedAt===null)!==(rotateBy===null)){
        throw new Error(
          "VIEWS_INTERNAL_SERVICE_PUBLIC_KEY_REFS_JSON rotation metadata must include activatedAt and rotateBy"
        );
      }
      if(
        activatedAt&&rotateBy&&
        Date.parse(rotateBy)<=Date.parse(activatedAt)
      ){
        throw new Error(
          "VIEWS_INTERNAL_SERVICE_PUBLIC_KEY_REFS_JSON rotateBy must be after activatedAt"
        );
      }
      if(kids.has(kid)){
        throw new Error(
          "VIEWS_INTERNAL_SERVICE_PUBLIC_KEY_REFS_JSON kid must be unique per service"
        );
      }
      kids.add(kid);

      const owner=refOwners.get(ref);
      if(owner&&owner!==serviceId){
        throw new Error(
          "VIEWS_INTERNAL_SERVICE_PUBLIC_KEY_REFS_JSON reference cannot be shared across services"
        );
      }
      refOwners.set(ref,serviceId);
      entries.push({kid,ref,activatedAt,rotateBy});
    }
    result[serviceId]=entries;
  }

  return result;
}

function resolveInternalServicePublicKeyRefs(
  refs:Record<string,{
    kid:string;ref:string;activatedAt:string|null;rotateBy:string|null;
  }[]>,
  env:NodeJS.ProcessEnv
){
  const result:Record<string,ConfiguredInternalServicePublicKey[]>={};
  const fingerprints=new Map<string,string>();

  for(const [serviceId,entries] of Object.entries(refs)){
    result[serviceId]=entries.map(({kid,ref,activatedAt,rotateBy})=>{
      const pem=env[ref]?.trim();
      if(!pem){
        throw new Error("Referenced internal service public key "+ref+" is required");
      }

      let key:ReturnType<typeof createPublicKey>;
      try{
        key=createPublicKey(pem);
      }catch{
        throw new Error("Referenced internal service public key "+ref+" is invalid");
      }
      if(key.asymmetricKeyType!=="ed25519"){
        throw new Error("Referenced internal service public key "+ref+" must be Ed25519");
      }

      const fingerprint=createHash("sha256")
        .update(key.export({format:"der",type:"spki"}))
        .digest("hex");
      const owner=fingerprints.get(fingerprint);
      if(owner&&owner!==serviceId){
        throw new Error(
          "Resolved internal service public key cannot be shared across services"
        );
      }
      fingerprints.set(fingerprint,serviceId);

      return {kid,publicKeyPem:pem,activatedAt,rotateBy};
    });
  }

  return result;
}

function rotationTimestamp(
  value:unknown,
  required:boolean,
  field:"activatedAt"|"rotateBy"
){
  if(value===undefined||value===null||value===""){
    if(required){
      throw new Error(
        "VIEWS_INTERNAL_SERVICE_PUBLIC_KEY_REFS_JSON production keys require activatedAt and rotateBy"
      );
    }
    return null;
  }
  if(typeof value!=="string"){
    throw new Error(
      "VIEWS_INTERNAL_SERVICE_PUBLIC_KEY_REFS_JSON "+field+" must be an ISO timestamp"
    );
  }
  const timestamp=Date.parse(value);
  if(!Number.isFinite(timestamp)){
    throw new Error(
      "VIEWS_INTERNAL_SERVICE_PUBLIC_KEY_REFS_JSON "+field+" must be an ISO timestamp"
    );
  }
  return new Date(timestamp).toISOString();
}

function parseInternalServiceKeys(raw:string|undefined){
  const parsed=parseServiceMap(
    raw,
    "VIEWS_INTERNAL_SERVICE_KEYS_JSON"
  );
  const result:Record<string,string[]>={};
  const owners=new Map<string,string>();

  for(const [serviceId,keysValue] of Object.entries(parsed)){
    if(!Array.isArray(keysValue)||keysValue.length<1||keysValue.length>2){
      throw new Error("VIEWS_INTERNAL_SERVICE_KEYS_JSON service key ring must contain 1 or 2 keys");
    }

    const keys:string[]=[];
    for(const item of keysValue){
      if(typeof item!=="string"||item.trim().length<32){
        throw new Error("VIEWS_INTERNAL_SERVICE_KEYS_JSON keys must be at least 32 characters");
      }
      const key=item.trim();
      if(!keys.includes(key))keys.push(key);
    }
    if(keys.length<1){
      throw new Error("VIEWS_INTERNAL_SERVICE_KEYS_JSON service key ring is empty");
    }

    for(const key of keys){
      const owner=owners.get(key);
      if(owner&&owner!==serviceId){
        throw new Error("VIEWS_INTERNAL_SERVICE_KEYS_JSON key cannot be shared across services");
      }
      owners.set(key,serviceId);
    }
    result[serviceId]=keys;
  }

  return result;
}

function parseServiceMap(
  raw:string|undefined,
  name:
    |"VIEWS_INTERNAL_SERVICE_KEY_REFS_JSON"
    |"VIEWS_INTERNAL_SERVICE_KEYS_JSON"
    |"VIEWS_INTERNAL_SERVICE_PUBLIC_KEY_REFS_JSON"
){
  const value=raw?.trim();
  if(!value)return {} as Record<string,unknown>;

  let parsed:unknown;
  try{
    parsed=JSON.parse(value);
  }catch{
    throw new Error(name+" must be valid JSON");
  }
  if(!parsed||typeof parsed!=="object"||Array.isArray(parsed)){
    throw new Error(name+" must be an object");
  }

  for(const serviceId of Object.keys(parsed)){
    if(!SERVICE_ID.test(serviceId)){
      throw new Error(name+" contains invalid service id");
    }
  }

  return parsed as Record<string,unknown>;
}
