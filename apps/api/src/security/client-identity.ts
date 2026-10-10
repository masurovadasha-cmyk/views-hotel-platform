import {createHmac} from "node:crypto";
import {isIP} from "node:net";
import type {TrustedProxyMode} from "../config";
import {
  networkAddressAllowed,
  normalizeNetworkIp
} from "./network-cidr";

export type ClientNetworkInput={
  remoteAddress?:string|null;
  cfConnectingIp?:string|null;
};

export function clientNetworkKey(
  input:ClientNetworkInput,
  proxyMode:TrustedProxyMode,
  secret:string,
  trustedProxyCidrs:readonly string[]=[]
){
  const address=resolveClientAddress(
    input,
    proxyMode,
    trustedProxyCidrs
  );
  return createHmac("sha256",secret).update(address).digest("hex");
}

export function resolveClientAddress(
  input:ClientNetworkInput,
  proxyMode:TrustedProxyMode,
  trustedProxyCidrs:readonly string[]=[]
){
  const forwardedIdentity=proxyMode!=="direct";
  if(forwardedIdentity){
    if(!networkAddressAllowed(
      input.remoteAddress,
      trustedProxyCidrs
    )){
      throw new Error("CLIENT_PROXY_NOT_TRUSTED");
    }
  }

  const raw=forwardedIdentity
    ?String(input.cfConnectingIp||"").trim()
    :String(input.remoteAddress||"").trim();

  const normalized=normalizeNetworkIp(raw);
  if(!normalized||!isIP(normalized)){
    throw new Error("CLIENT_NETWORK_IDENTITY_UNAVAILABLE");
  }
  return normalized;
}
