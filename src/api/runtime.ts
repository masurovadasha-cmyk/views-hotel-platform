export type RuntimeMode="static-demo"|"live-api"|"local-core";

export function detectRuntimeMode(locationHref=globalThis.location?.href||""){
  const url=new URL(locationHref||"https://example.invalid/");
  if((!url.searchParams.has("api")||url.searchParams.get("api")==="local-core")&&url.protocol==="http:"&&["127.0.0.1","localhost"].includes(url.hostname)&&url.port==="4173")return "local-core" as const;
  if(url.searchParams.get("api")==="demo")return "static-demo" as const;
  if(import.meta.env.VITE_RELEASE_REVIEW==='true')return 'static-demo' as const;
  if(url.searchParams.get("api")==="live")return "live-api" as const;
  if(url.hostname.endsWith("github.io"))return "static-demo" as const;
  return "live-api" as const;
}

export function runtimeLabel(mode:RuntimeMode){
  if(mode==="local-core")return "Локальный Core · тест";
  return mode==="live-api"?"Live API":"Static staging demo";
}
