'use strict';
// Same-origin static web + guest cookie gateway for disposable local proofs only.
const http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path');
const {randomBytes}=require('node:crypto');
const {createGuestEmailGateway}=require('../../apps/api/ops/guest-email-gateway.cjs');
module.exports=async function startGuestWeb(coreOrigin){
 const root=path.resolve(__dirname,'../../dist');await fs.access(path.join(root,'index.html'));
 let gateway;
 const server=http.createServer(async(req,res)=>{
  try{
   if(await gateway(req,res))return;
   if(req.method!=='GET'){res.writeHead(405);res.end();return;}
   const url=new URL(req.url,'http://fixture.invalid');
   const file=url.pathname==='/'?'index.html':decodeURIComponent(url.pathname).slice(1);
   const resolved=path.resolve(root,file);
   if(!resolved.startsWith(root+path.sep)||!['.html','.js','.css','.json','.png','.svg','.webp','.woff2'].includes(path.extname(resolved))){res.writeHead(404);res.end();return;}
   const bytes=await fs.readFile(resolved);
   const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'};
   res.writeHead(200,{'Content-Type':mime[path.extname(resolved)]||'application/octet-stream','Cache-Control':'no-store','Referrer-Policy':'no-referrer',
    'Content-Security-Policy':"default-src 'self'; script-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'; object-src 'none'; base-uri 'self'"});res.end(bytes);
  }catch{if(!res.headersSent)res.writeHead(404);res.end();}
 });
 server.requestTimeout=15000;server.headersTimeout=10000;
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 const origin='http://127.0.0.1:'+server.address().port;
 gateway=createGuestEmailGateway({origin,coreOrigin,csrfKey:randomBytes(32).toString('hex')});
 return {origin,close:()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();})};
};
