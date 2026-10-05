export type TrustedProxyMode="direct"|"cloudflare";

export type ApiConfig={
  port:number;
  databaseUrl:string;
  nodeEnv:"development"|"test"|"production";
  trustedProxyMode:TrustedProxyMode;
  guestAuthRateLimitSecret:string;
  internalApiKey:string;
  internalApiKeys:string[];
  internalServiceKeys:Record<string,string[]>;
};

const SERVICE_ID=/^[a-z0-9][a-z0-9._:-]{1,63}$/;
const SECRET_REF=/^[A-Z][A-Z0-9_]{2,127}$/;

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
  if(nodeEnv==="production"&&Object.keys(serviceKeyRefs).length===0){
    throw new Error("VIEWS_INTERNAL_SERVICE_KEY_REFS_JSON is required in production");
  }

  const internalServiceKeys=Object.keys(serviceKeyRefs).length>0
    ?resolveInternalServiceKeyRefs(serviceKeyRefs,env)
    :rawServiceKeys;

  return {
    port,databaseUrl,nodeEnv,trustedProxyMode,
    guestAuthRateLimitSecret,internalApiKey,internalApiKeys,internalServiceKeys
  };
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
  name:"VIEWS_INTERNAL_SERVICE_KEY_REFS_JSON"|"VIEWS_INTERNAL_SERVICE_KEYS_JSON"
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
