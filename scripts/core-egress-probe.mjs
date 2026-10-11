import {connect} from "node:net";
import {pathToFileURL} from "node:url";

const DENIED=new Set(["ENETUNREACH","EHOSTUNREACH","ECONNREFUSED","ETIMEDOUT","EACCES","EPERM"]);
function result(kind,target,port,start,outcome,errorCode=null,status=null){
  return {schemaVersion:1,attempted:true,kind,target,port,outcome,errorCode,status,
    elapsedMs:Math.round(performance.now()-start)};
}

export async function probeNetwork(kind,target,port=null,timeoutMs=2500,fetchImpl=globalThis.fetch){
  if(!Number.isInteger(timeoutMs)||timeoutMs<50||timeoutMs>10000)throw new Error("INVALID_PROBE_TIMEOUT");
  if(kind==="tcp"){
    if(typeof target!=="string"||!target||!Number.isInteger(port)||port<1||port>65535)
      throw new Error("INVALID_TCP_PROBE");
    const start=performance.now();
    return new Promise(resolve=>{
      let done=false;
      const socket=connect({host:target,port});
      const finish=(outcome,code=null)=>{
        if(done)return;
        done=true;
        clearTimeout(timer);
        socket.destroy();
        resolve(result(kind,target,port,start,outcome,code));
      };
      const timer=setTimeout(()=>finish("unreachable","ETIMEDOUT"),timeoutMs);
      socket.once("connect",()=>finish("connected"));
      socket.once("error",error=>finish(DENIED.has(error.code)?"unreachable":"error",error.code||"UNKNOWN"));
    });
  }
  if(kind!=="http")throw new Error("INVALID_PROBE_KIND");
  const url=new URL(target);
  if(!["http:","https:"].includes(url.protocol)||url.username||url.password||url.search||url.hash)
    throw new Error("INVALID_HTTP_PROBE");
  const start=performance.now();
  try{
    const response=await fetchImpl(url,{redirect:"manual",signal:AbortSignal.timeout(timeoutMs)});
    const status=response.status;
    await response.body?.cancel();
    return result(kind,target,null,start,"connected",null,status);
  }catch(error){
    const code=error?.name==="TimeoutError"?"ETIMEDOUT":error?.cause?.code||error?.code||"UNKNOWN";
    // DNS, TLS certificate and programming failures are NOT proof of isolation.
    return result(kind,target,null,start,DENIED.has(code)?"unreachable":"error",code);
  }
}

export async function runProbe(argv=process.argv.slice(2),output=process.stdout){
  const [kind,target,rawPort,rawTimeout]=argv;
  if(argv.length!==4)throw new Error("INVALID_PROBE_ARGUMENTS");
  const measurement=await probeNetwork(kind,target,kind==="tcp"?Number(rawPort):null,Number(rawTimeout));
  output.write(JSON.stringify(measurement)+"\n");
}

if(process.argv[1]==="-"||(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)){
  runProbe().catch(()=>{
    process.stderr.write(JSON.stringify({schemaVersion:1,attempted:false,error:"PROBE_EXECUTION_ERROR"})+"\n");
    process.exitCode=2;
  });
}
