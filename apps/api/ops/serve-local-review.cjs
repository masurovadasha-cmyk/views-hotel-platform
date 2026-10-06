'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const ROOT=path.resolve(__dirname,'../../../dist');
if(!fs.existsSync(path.join(ROOT,'index.html')))throw Error('BUILD_WEB_FIRST');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.ico':'image/x-icon'};
http.createServer((req,res)=>{
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');
 if(!['127.0.0.1:4173','localhost:4173'].includes(req.headers.host)){res.writeHead(403);res.end();return;}
 if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
 let relative;try{relative=decodeURIComponent(new URL(req.url,'http://127.0.0.1:4173').pathname);}catch{res.writeHead(400);res.end();return;}
 if(/^\/(?:api|v1)(?:\/|$)/.test(relative)){res.writeHead(503,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'STATIC_REVIEW_NOT_CONNECTED_TO_CORE'}));return;}
 if(relative.includes('\\')||relative.includes('\0')){res.writeHead(400);res.end();return;}
 let file=path.resolve(ROOT,'.'+relative);
 if(file!==ROOT&&!file.startsWith(ROOT+path.sep)){res.writeHead(403);res.end();return;}
 try{if(!fs.statSync(file).isFile())file=path.join(ROOT,'index.html');}catch{file=path.extname(relative)?null:path.join(ROOT,'index.html');}
 if(!file){res.writeHead(404);res.end();return;}
 try{const real=fs.realpathSync(file);if(!real.startsWith(fs.realpathSync(ROOT)+path.sep))throw Error();
  const data=fs.readFileSync(real);res.writeHead(200,{'Content-Type':mime[path.extname(real)]||'application/octet-stream','Content-Length':data.length});res.end(req.method==='HEAD'?undefined:data);
 }catch{res.writeHead(404);res.end();}
}).listen(4173,'127.0.0.1',()=>console.log('VIEWS local static review: http://127.0.0.1:4173/?api=demo'));
