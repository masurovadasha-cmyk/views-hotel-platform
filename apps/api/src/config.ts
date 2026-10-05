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
  if(nodeEnv==="production"&&!configuredInternalKey){
    throw new Error("VIEWS_INTERNAL_API_KEY is required in production");
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

  const internalServiceKeys=parseInternalServiceKeys(
    env.VIEWS_INTERNAL_SERVICE_KEYS_JSON
  );
  if(nodeEnv==="production"&&Object.keys(internalServiceKeys).length===0){
    throw new Error("VIEWS_INTERNAL_SERVICE_KEYS_JSON is required in production");
  }

  return {
    port,databaseUrl,nodeEnv,trustedProxyMode,
    guestAuthRateLimitSecret,internalApiKey,internalApiKeys,internalServiceKeys
  };
}

function parseInternalServiceKeys(raw:string|undefined){
  const value=raw?.trim();
  if(!value)return {} as Record<string,string[]>;

  let parsed:unknown;
  try{
    parsed=JSON.parse(value);
  }catch{
    throw new Error("VIEWS_INTERNAL_SERVICE_KEYS_JSON must be valid JSON");
  }
  if(!parsed||typeof parsed!=="object"||Array.isArray(parsed)){
    throw new Error("VIEWS_INTERNAL_SERVICE_KEYS_JSON must be an object");
  }

  const result:Record<string,string[]>={};
  const owners=new Map<string,string>();

  for(const [serviceId,keysValue] of Object.entries(parsed as Record<string,unknown>)){
    if(!SERVICE_ID.test(serviceId)){
      throw new Error("VIEWS_INTERNAL_SERVICE_KEYS_JSON contains invalid service id");
    }
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
