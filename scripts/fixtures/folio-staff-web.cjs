'use strict';
// Fixed loopback browser boundary; Core target is supplied by the disposable runner.
const http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path');
const {createLocalGateway}=require('../../apps/api/ops/local-core-gateway.cjs');
module.exports=async function({coreOrigin,organizationId,propertyId,internalKey}){
 if(!/^http:\/\/127\.0\.0\.1:\d+$/.test(coreOrigin))throw Error('LOOPBACK_CORE_REQUIRED');
 const root=path.resolve(__dirname,'../../dist');
 const gateway=createLocalGateway({configuration:{fixture:{organizationId,propertyId,units:[]},internalKey},fetchImpl:(url,init)=>{
  if(!url.startsWith('http://127.0.0.1:3001/v1/'))throw Error('UNEXPECTED_CORE_TARGET');
  return fetch(coreOrigin+url.slice('http://127.0.0.1:3001'.length),init);
 }});
 const server=http.createServer(async(req,res)=>{
  try{
   if(await gateway(req,res))return;
   if(req.method!=='GET'){res.writeHead(405);res.end();return;}
   const u=new URL(req.url,'http://fixture.invalid'),file=path.resolve(root,decodeURIComponent(u.pathname.slice(1))||'index.html');
   if(!file.startsWith(root+path.sep)){res.writeHead(404);res.end();return;}
   const data=await fs.readFile(file);res.writeHead(200,{'Cache-Control':'no-store','Content-Type':{'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml'}[path.extname(file)]||'application/octet-stream'});res.end(data);
  }catch{if(!res.headersSent)res.writeHead(404);res.end();}
 });
 // A busy port is a blocker; never stop an existing installation.
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(4173,'127.0.0.1',resolve);});
 return {origin:'http://127.0.0.1:4173',close:()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();})};
};
