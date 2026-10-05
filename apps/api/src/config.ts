export type TrustedProxyMode="direct"|"cloudflare";

export type ApiConfig={
  port:number;
  databaseUrl:string;
  nodeEnv:"development"|"test"|"production";
  trustedProxyMode:TrustedProxyMode;
  guestAuthRateLimitSecret:string;
};

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

  const configuredSecret=env.GUEST_AUTH_RATE_LIMIT_SECRET?.trim();
  if(configuredSecret&&configuredSecret.length<32){
    throw new Error("GUEST_AUTH_RATE_LIMIT_SECRET must be at least 32 characters");
  }
  if(nodeEnv==="production"&&!configuredSecret){
    throw new Error("GUEST_AUTH_RATE_LIMIT_SECRET is required in production");
  }
  const guestAuthRateLimitSecret=configuredSecret
    ??"views-development-only-rate-limit-secret-not-for-production";

  return {
    port,databaseUrl,nodeEnv,trustedProxyMode,guestAuthRateLimitSecret
  };
}
