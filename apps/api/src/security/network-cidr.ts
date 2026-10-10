import {BlockList,isIP} from "node:net";

export type NetworkAddressFamily="ipv4"|"ipv6";

export function validateNetworkRange(value:string){
  parseNetworkRange(value);
  return value.trim();
}

export function networkRangeIsHost(value:string){
  const parsed=parseNetworkRange(value);
  return parsed.prefix===(parsed.family==="ipv4"?32:128);
}

export function networkAddressAllowed(
  address:string|null|undefined,
  ranges:readonly string[]
){
  const normalized=normalizeNetworkIp(String(address||"").trim());
  const version=isIP(normalized);
  if(!version)return false;

  const family:NetworkAddressFamily=version===4?"ipv4":"ipv6";
  const block=new BlockList();

  for(const range of ranges){
    const parsed=parseNetworkRange(range);
    block.addSubnet(parsed.address,parsed.prefix,parsed.family);
  }

  return block.check(normalized,family);
}

export function normalizeNetworkIp(value:string){
  const trimmed=value.trim();
  if(trimmed.startsWith("::ffff:")){
    const v4=trimmed.slice("::ffff:".length);
    if(isIP(v4)===4)return v4;
  }
  return trimmed;
}

function parseNetworkRange(value:string){
  const raw=String(value||"").trim();
  if(!raw)throw new Error("INVALID_NETWORK_CIDR");

  const parts=raw.split("/");
  if(parts.length>2)throw new Error("INVALID_NETWORK_CIDR");

  const address=normalizeNetworkIp(parts[0]);
  const version=isIP(address);
  if(!version)throw new Error("INVALID_NETWORK_CIDR");

  const family:NetworkAddressFamily=version===4?"ipv4":"ipv6";
  const maxPrefix=version===4?32:128;
  const prefix=parts.length===2?Number(parts[1]):maxPrefix;

  if(!Number.isInteger(prefix)||prefix<0||prefix>maxPrefix){
    throw new Error("INVALID_NETWORK_CIDR");
  }

  try{
    const probe=new BlockList();
    probe.addSubnet(address,prefix,family);
  }catch{
    throw new Error("INVALID_NETWORK_CIDR");
  }

  return {address,prefix,family};
}
