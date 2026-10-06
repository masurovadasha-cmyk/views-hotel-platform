import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
const v4='0.0.0.0/8 10.0.0.0/8 100.64.0.0/10 127.0.0.0/8 169.254.0.0/16 172.16.0.0/12 192.0.0.0/24 192.0.2.0/24 192.168.0.0/16 198.18.0.0/15 198.51.100.0/24 203.0.113.0/24 224.0.0.0/4 240.0.0.0/4';
const v6='::/128 ::1/128 ::ffff:0:0/96 64:ff9b::/96 64:ff9b:1::/48 100::/64 2001::/32 2001:db8::/32 2002::/16 fc00::/7 fe80::/10 ff00::/8';
const acl=[
  'acl views_core src 172.31.0.2/32','acl SSL_ports port 443','acl CONNECT method CONNECT',
  'acl views_allowed dstdomain -n "/etc/squid/allowed-domains.txt"',
  'acl views_forbidden_v4 dst '+v4,'acl views_forbidden_v6 dst '+v6
];
const access=['http_access deny !views_core','http_access deny !CONNECT','http_access deny !SSL_ports',
  'http_access deny !views_allowed','http_access deny views_forbidden_v4','http_access deny views_forbidden_v6',
  'http_access allow views_core CONNECT views_allowed','http_access deny all'];
const safeOther=new Set(['http_port 3128','hosts_file /etc/hosts','cache deny all','cache_mem 0 MB',
  'maximum_object_size 0 KB','access_log stdio:/var/log/squid/access.log','cache_log /var/log/squid/cache.log',
  'logfile_rotate 0','via off','forwarded_for delete']);
export function evaluateRelayDestinationPolicy(raw){
  const lines=String(raw).split(/\r?\n/).map(line=>line.replace(/#.*$/,'').trim().replace(/\s+/g,' ')).filter(Boolean);
  const findings=[];
  const actualAcl=lines.filter(line=>line.startsWith('acl '));
  const actualAccess=lines.filter(line=>line.startsWith('http_access '));
  if(JSON.stringify(actualAcl)!==JSON.stringify(acl))findings.push('RELAY_DESTINATION_ACL_CHANGED');
  if(JSON.stringify(actualAccess)!==JSON.stringify(access))findings.push('RELAY_ACCESS_ORDER_CHANGED');
  const other=lines.filter(line=>!line.startsWith('acl ')&&!line.startsWith('http_access '));
  if(other.length!==safeOther.size||other.some(line=>!safeOther.has(line))||new Set(other).size!==safeOther.size)
    findings.push('RELAY_UNREVIEWED_DIRECTIVE');
  return {ok:findings.length===0,schemaVersion:1,checks:['exact-core-source','connect-443-only','no-reverse-dns',
    'private-ipv4-denied','private-ipv6-denied','deny-before-allow'],findings};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{
    const result=evaluateRelayDestinationPolicy(readFileSync('infra/egress/squid.conf','utf8'));
    console.log(JSON.stringify(result));process.exitCode=result.ok?0:1;
  }catch{console.error(JSON.stringify({ok:false,error:'RELAY_POLICY_UNREADABLE'}));process.exitCode=2;}
}
