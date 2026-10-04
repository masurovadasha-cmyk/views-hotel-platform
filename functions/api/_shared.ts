export type D1Result={results?:unknown[];meta?:{changes?:number}};
export type D1Statement={bind:(...values:unknown[])=>D1Statement;first:<T=Record<string,unknown>>()=>Promise<T|null>;all:()=>Promise<D1Result>;run:()=>Promise<D1Result>};
export type D1Database={prepare:(sql:string)=>D1Statement;batch:(statements:D1Statement[])=>Promise<D1Result[]>};
export type Env={
  DB?:D1Database;
  VIEWS_ENV?:string;
  VIEWS_ALLOW_DEMO_HEADERS?:string;
  VIEWS_ALLOWED_ORIGINS?:string;
  VIEWS_EXPOSE_LOGIN_TOKEN?:string;
};

export function json(data:unknown,status=200){
  return Response.json(data,{status,headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
}

export function requestId(request:Request){
  return request.headers.get("cf-ray")||crypto.randomUUID();
}

export function requireDatabase(env:Env){
  if(!env.DB) throw new Error("DATABASE_NOT_BOUND");
  return env.DB;
}

export function demoRole(request:Request){
  return request.headers.get("x-views-demo-role");
}
