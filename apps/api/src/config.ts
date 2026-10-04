export type ApiConfig={
  port:number;
  databaseUrl:string;
  nodeEnv:"development"|"test"|"production";
};

export function loadConfig(env:NodeJS.ProcessEnv=process.env):ApiConfig{
  const databaseUrl=env.DATABASE_URL?.trim();
  if(!databaseUrl)throw new Error("DATABASE_URL is required");
  const nodeEnv=(env.NODE_ENV||"development") as ApiConfig["nodeEnv"];
  if(!["development","test","production"].includes(nodeEnv))throw new Error("Invalid NODE_ENV");
  const port=Number(env.PORT||3001);
  if(!Number.isInteger(port)||port<1||port>65535)throw new Error("Invalid PORT");
  return {port,databaseUrl,nodeEnv};
}
