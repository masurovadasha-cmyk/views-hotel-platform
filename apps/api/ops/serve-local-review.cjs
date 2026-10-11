'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const {createLocalGateway}=require('./local-core-gateway.cjs');
const ROOT=path.resolve(__dirname,'../../../dist');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.ico':'image/x-icon'};
function createReviewServer(options){
 const gateway=createLocalGateway(options);
 const server=http.createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('X-Frame-Options','DENY');res.setHeader('Cross-Origin-Resource-Policy','same-origin');
  res.setHeader('Content-Security-Policy',"default-src 'self'; img-src 'self' https: data:; connect-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
  if(!['127.0.0.1:4173','localhost:4173'].includes(req.headers.host)){res.writeHead(403);res.end();return;}
  if(!req.url?.startsWith('/')||req.url.startsWith('//')){res.writeHead(400);res.end();return;}
  if(await gateway(req,res))return;
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
  let relative;try{relative=decodeURIComponent(new URL(req.url,'http://127.0.0.1:4173').pathname);}catch{res.writeHead(400);res.end();return;}
  if(/^\/(?:api|v1)(?:\/|$)/.test(relative)){res.writeHead(503,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'USE_EXPLICIT_LOCAL_WORKSPACE'}));return;}
  if(relative.includes('\\')||relative.includes('\0')){res.writeHead(400);res.end();return;}
  let file=path.resolve(ROOT,'.'+relative);
  if(file!==ROOT&&!file.startsWith(ROOT+path.sep)){res.writeHead(403);res.end();return;}
  try{if(!fs.statSync(file).isFile())file=path.join(ROOT,'index.html');}catch{file=path.extname(relative)?null:path.join(ROOT,'index.html');}
  if(!file){res.writeHead(404);res.end();return;}
  try{const real=fs.realpathSync(file);if(!real.startsWith(fs.realpathSync(ROOT)+path.sep))throw Error();
    const data=fs.readFileSync(real);res.writeHead(200,{'Content-Type':mime[path.extname(real)]||'application/octet-stream','Content-Length':data.length});res.end(req.method==='HEAD'?undefined:data);
  }catch{res.writeHead(404);res.end();}
 });
 server.requestTimeout=15000;server.headersTimeout=10000;server.maxHeadersCount=50;
 return server;
}
module.exports={createReviewServer};
if(require.main===module){
 if(!fs.existsSync(path.join(ROOT,'index.html')))throw Error('BUILD_WEB_FIRST');
 createReviewServer().listen(4173,'127.0.0.1',()=>console.log('VIEWS local workspace: http://127.0.0.1:4173/?api=local-core'));
}
