export type RuntimeMode="static-demo"|"live-api";

export function detectRuntimeMode(locationHref=globalThis.location?.href||""){
  const url=new URL(locationHref||"https://example.invalid/");
  if(url.searchParams.get("api")==="live")return "live-api" as const;
  if(url.hostname.endsWith("github.io"))return "static-demo" as const;
  return "live-api" as const;
}

export function runtimeLabel(mode:RuntimeMode){
  return mode==="live-api"?"Live API":"Static staging demo";
}
