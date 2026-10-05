import {createHmac} from "node:crypto";
import {isIP} from "node:net";
import type {TrustedProxyMode} from "../config";

export type ClientNetworkInput={
  remoteAddress?:string|null;
  cfConnectingIp?:string|null;
};

export function clientNetworkKey(
  input:ClientNetworkInput,
  proxyMode:TrustedProxyMode,
  secret:string
){
  const address=resolveClientAddress(input,proxyMode);
  return createHmac("sha256",secret).update(address).digest("hex");
}

export function resolveClientAddress(
  input:ClientNetworkInput,
  proxyMode:TrustedProxyMode
){
  const raw=proxyMode==="cloudflare"
    ?String(input.cfConnectingIp||"").trim()
    :String(input.remoteAddress||"").trim();

  const normalized=normalizeIp(raw);
  if(!normalized||!isIP(normalized)){
    throw new Error("CLIENT_NETWORK_IDENTITY_UNAVAILABLE");
  }
  return normalized;
}

function normalizeIp(value:string){
  if(!value)return "";
  if(value.startsWith("::ffff:")){
    const v4=value.slice("::ffff:".length);
    if(isIP(v4)===4)return v4;
  }
  return value;
}
