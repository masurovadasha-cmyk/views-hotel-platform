import {readFile} from "node:fs/promises";
import {isIP} from "node:net";
import {pathToFileURL} from "node:url";

export class EgressDomainPolicyError extends Error{
  constructor(code){
    super(code);
    this.name="EgressDomainPolicyError";
    this.code=code;
  }
}

export function parseEgressDomainPolicy(raw){
  const entries=String(raw??"")
    .split(/\r?\n/)
    .map(line=>line.replace(/\s+#.*$/,"").trim())
    .filter(Boolean);

  if(entries.length===0){
    throw new EgressDomainPolicyError("EGRESS_DOMAIN_POLICY_EMPTY");
  }

  const normalized=[];
  const seen=new Set();

  for(const entry of entries){
    if(entry.includes("://")||entry.includes("/")||entry.includes(":")){
      throw new EgressDomainPolicyError("EGRESS_DOMAIN_POLICY_HOST_ONLY");
    }
    if(entry.includes("*")){
      throw new EgressDomainPolicyError("EGRESS_DOMAIN_POLICY_WILDCARD_FORBIDDEN");
    }

    const value=entry.toLowerCase();
    const host=value.startsWith(".")?value.slice(1):value;

    if(
      !host||
      host.length>253||
      isIP(host)!==0||
      host==="localhost"||
      host.endsWith(".localhost")||
      host.endsWith(".local")||
      host.endsWith(".internal")||
      host==="metadata.google.internal"||
      host.endsWith(".arpa")||
      !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(host)||
      !host.includes(".")||
      host.split(".").some(label=>
        !label||label.length>63||label.startsWith("-")||label.endsWith("-")
      )
    ){
      throw new EgressDomainPolicyError("EGRESS_DOMAIN_POLICY_INVALID_HOST");
    }

    const canonical=value.startsWith(".")?"."+host:host;
    if(!seen.has(canonical)){
      normalized.push(canonical);
      seen.add(canonical);
    }
  }

  return normalized.sort();
}

export async function runEgressDomainPolicyGate(
  argv=process.argv.slice(2),
  output=process.stdout
){
  let file="infra/egress/allowed-domains.txt";
  for(const arg of argv){
    if(arg.startsWith("--file=")){
      file=arg.slice("--file=".length).trim();
      if(!file)throw new EgressDomainPolicyError("INVALID_ARGUMENT");
    }else{
      throw new EgressDomainPolicyError("INVALID_ARGUMENT");
    }
  }

  const entries=parseEgressDomainPolicy(await readFile(file,"utf8"));
  output.write(JSON.stringify({
    ok:true,
    schemaVersion:1,
    entries,
    count:entries.length
  })+"\n");
  return 0;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  runEgressDomainPolicyGate().then(
    code=>{process.exitCode=code},
    error=>{
      const code=error instanceof EgressDomainPolicyError
        ?error.code
        :"EGRESS_DOMAIN_POLICY_ERROR";
      process.stderr.write(JSON.stringify({ok:false,error:code})+"\n");
      process.exitCode=2;
    }
  );
}
