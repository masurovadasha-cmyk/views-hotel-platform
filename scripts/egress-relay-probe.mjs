import net from "node:net";

const [mode,proxyHost,proxyPortRaw,targetHost,targetPortRaw]=process.argv.slice(2);
const proxyPort=Number(proxyPortRaw);
const targetPort=Number(targetPortRaw);
const timeoutMs=5000;

if(!mode||!proxyHost||!Number.isInteger(proxyPort)||!targetHost||!Number.isInteger(targetPort)){
  process.stderr.write(JSON.stringify({error:"INVALID_ARGUMENT"})+"\n");
  process.exit(2);
}

const socket=net.connect({host:proxyHost,port:proxyPort});
let buffer="";
let done=false;
const timer=setTimeout(()=>finish("timeout"),timeoutMs);

socket.setEncoding("utf8");
socket.once("error",error=>finish("proxy_unreachable",error.code||"ERROR"));
socket.once("connect",()=>{
  if(mode==="connect"){
    socket.write(
      "CONNECT "+targetHost+":"+targetPort+" HTTP/1.1\r\n"+
      "Host: "+targetHost+":"+targetPort+"\r\n"+
      "Proxy-Connection: close\r\n\r\n"
    );
  }else if(mode==="http"){
    socket.write(
      "GET http://"+targetHost+"/ HTTP/1.1\r\n"+
      "Host: "+targetHost+"\r\n"+
      "Connection: close\r\n\r\n"
    );
  }else{
    finish("invalid_mode");
  }
});
socket.on("data",chunk=>{
  buffer+=chunk;
  const end=buffer.indexOf("\r\n");
  if(end<0)return;
  const line=buffer.slice(0,end);
  const match=line.match(/^HTTP\/\d\.\d\s+(\d{3})/);
  if(!match)return finish("invalid_response");
  finish("response",null,Number(match[1]),line);
});

function finish(outcome,error=null,status=null,statusLine=null){
  if(done)return;
  done=true;
  clearTimeout(timer);
  try{socket.destroy()}catch{}
  process.stdout.write(JSON.stringify({
    schemaVersion:1,
    attempted:true,
    mode,
    proxyHost,
    proxyPort,
    targetHost,
    targetPort,
    outcome,
    error,
    status,
    statusLine
  })+"\n");
  process.exit(outcome==="response"?0:1);
}
