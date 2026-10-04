export type Env={DB?:D1Database;VIEWS_ENV?:string};

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
