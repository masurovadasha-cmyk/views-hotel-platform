import {readdir,readFile} from "node:fs/promises";
import {join,relative,sep} from "node:path";
import {pathToFileURL} from "node:url";

const ROOT="apps/api/src";
const EGRESS_PREFIX="security/egress/";

const RULES=[
  {
    code:"DIRECT_FETCH_FORBIDDEN",
    pattern:/\bfetch\s*\(/g
  },
  {
    code:"DIRECT_HTTP_IMPORT_FORBIDDEN",
    pattern:/from\s+["'](?:node:)?https?["']|import\s*\(\s*["'](?:node:)?https?["']\s*\)/g
  },
  {
    code:"DIRECT_TLS_IMPORT_FORBIDDEN",
    pattern:/from\s+["'](?:node:)?tls["']|import\s*\(\s*["'](?:node:)?tls["']\s*\)/g
  },
  {
    code:"DIRECT_DNS_IMPORT_FORBIDDEN",
    pattern:/from\s+["'](?:node:)?dns(?:\/promises)?["']|import\s*\(\s*["'](?:node:)?dns(?:\/promises)?["']\s*\)/g
  },
  {
    code:"DIRECT_DGRAM_IMPORT_FORBIDDEN",
    pattern:/from\s+["'](?:node:)?dgram["']|import\s*\(\s*["'](?:node:)?dgram["']\s*\)/g
  },
  {
    code:"DIRECT_HTTP_CLIENT_PACKAGE_FORBIDDEN",
    pattern:/from\s+["'](?:undici|axios|got)["']|import\s*\(\s*["'](?:undici|axios|got)["']\s*\)/g
  },
  {
    code:"DIRECT_WEBSOCKET_FORBIDDEN",
    pattern:/\bnew\s+WebSocket\s*\(|\bWebSocket\s*\(/g
  }
];

export async function scanCoreNetworkPrimitives(
  root=ROOT,
  read=readFile,
  list=readdir
){
  const files=await collectTypeScriptFiles(root,list);
  const findings=[];

  for(const file of files){
    const normalized=relative(root,file).split(sep).join("/");
    if(isExcluded(normalized))continue;

    const source=await read(file,"utf8");

    if(
      /from\s+["'](?:node:)?net["']/.test(source)&&
      normalized!=="security/network-cidr.ts"
    ){
      findings.push({
        code:"DIRECT_NET_IMPORT_FORBIDDEN",
        file:normalized
      });
    }

    if(normalized==="security/network-cidr.ts"){
      if(
        /\b(?:createConnection|connect|Socket|Server)\b/.test(source)
      ){
        findings.push({
          code:"NETWORK_CIDR_NET_USAGE_EXPANDED",
          file:normalized
        });
      }
    }

    for(const rule of RULES){
      rule.pattern.lastIndex=0;
      if(rule.pattern.test(source)){
        findings.push({
          code:rule.code,
          file:normalized
        });
      }
    }
  }

  return {
    ok:findings.length===0,
    schemaVersion:1,
    scannedFiles:files.filter(file=>{
      const normalized=relative(root,file).split(sep).join("/");
      return !isExcluded(normalized);
    }).length,
    findings
  };
}

export async function runCoreNetworkPrimitiveGate(
  argv=process.argv.slice(2),
  output=process.stdout
){
  let root=ROOT;
  for(const arg of argv){
    if(arg.startsWith("--root=")){
      root=arg.slice("--root=".length).trim();
      if(!root)throw new Error("INVALID_ROOT");
    }else{
      throw new Error("INVALID_ARGUMENT");
    }
  }

  const result=await scanCoreNetworkPrimitives(root);
  output.write(JSON.stringify(result)+"\n");
  return result.ok?0:1;
}

async function collectTypeScriptFiles(root,list){
  const result=[];

  async function walk(dir){
    const entries=await list(dir,{withFileTypes:true});
    for(const entry of entries){
      const path=join(dir,entry.name);
      if(entry.isDirectory()){
        await walk(path);
      }else if(entry.isFile()&&/\.tsx?$/.test(entry.name)){
        result.push(path);
      }
    }
  }

  await walk(root);
  return result.sort();
}

function isExcluded(normalized){
  return (
    normalized.startsWith(EGRESS_PREFIX)||
    /(?:^|\.)test\.tsx?$/.test(normalized)||
    /(?:^|\.)spec\.tsx?$/.test(normalized)
  );
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  runCoreNetworkPrimitiveGate().then(
    code=>{process.exitCode=code},
    error=>{
      process.stderr.write(JSON.stringify({
        ok:false,
        error:error instanceof Error?error.message:"CORE_NETWORK_PRIMITIVE_GATE_ERROR"
      })+"\n");
      process.exitCode=2;
    }
  );
}
