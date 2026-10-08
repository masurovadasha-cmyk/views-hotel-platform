import {describe,it,expect,afterEach,vi} from 'vitest';
import http from 'node:http';
import {createRequire} from 'node:module';
const {createGuestEmailGateway}=createRequire(import.meta.url)('../apps/api/ops/guest-email-gateway.cjs');
const servers=[];
async function serve(handler){
 const server=http.createServer(handler);servers.push(server);
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));return 'http://127.0.0.1:'+server.address().port;
}
async function fixture(handler){
 vi.stubEnv('NODE_ENV','test');vi.stubEnv('VIEWS_LOCAL_REHEARSAL','true');vi.stubEnv('VIEWS_GUEST_EMAIL_PILOT_ENABLED','true');
 const coreOrigin=await serve(handler);let gateway;
 const origin=await serve((req,res)=>gateway(req,res));
 gateway=createGuestEmailGateway({origin,coreOrigin,csrfKey:'a'.repeat(64)});
 return async(route,extra={})=>fetch(origin+'/guest-api/'+route,{...extra,headers:{'X-Views-Guest-Pilot':'1',Origin:origin,...extra.headers}});
}
afterEach(async()=>{vi.unstubAllEnvs();await Promise.all(servers.splice(0).map(s=>new Promise(resolve=>{s.close(resolve);s.closeAllConnections();})));});
describe('guest email cookie boundary',()=>{
 it('rejects arbitrary upstreams and browser origins',()=>{
  for(const url of ['https://remote.example','http://localhost:3001','http://127.0.0.1:3001/private','http://user:pass@127.0.0.1:3001']){
   expect(()=>createGuestEmailGateway({origin:'http://127.0.0.1:4174',coreOrigin:url,csrfKey:'a'.repeat(64)})).toThrow();
   expect(()=>createGuestEmailGateway({origin:url,coreOrigin:'http://127.0.0.1:3001',csrfKey:'a'.repeat(64)})).toThrow();
  }
 });
 it('requires all local test flags on every request',async()=>{
  const upstream=vi.fn(),call=await fixture(upstream);
  for(const [key,value] of [['NODE_ENV','production'],['VIEWS_LOCAL_REHEARSAL','false'],['VIEWS_GUEST_EMAIL_PILOT_ENABLED','false']]){
   const old=process.env[key];vi.stubEnv(key,value);expect((await call('session')).status).toBe(404);vi.stubEnv(key,old);
  }
  expect(upstream).not.toHaveBeenCalled();
 });
 it('keeps an existing cookie when Core is unavailable instead of reporting a logout',async()=>{
  const call=await fixture((_req,res)=>{res.writeHead(503,{'Content-Type':'application/json'});res.end(JSON.stringify({message:'INTERNAL_PRIVATE_DETAIL'}));});
  const r=await call('session',{headers:{Cookie:'views_guest_email=vges_'+'a'.repeat(43)}});
  expect(r.status).toBe(503);expect(r.headers.get('set-cookie')).toBeNull();expect(await r.json()).toEqual({error:'GUEST_CORE_UNAVAILABLE'});
 });
 it('clears a session rejected by Core and never accepts duplicate cookies',async()=>{
  const upstream=vi.fn((_req,res)=>{res.writeHead(401);res.end(JSON.stringify({message:'GUEST_EMAIL_SESSION_INVALID'}));});
  const call=await fixture(upstream),token='vges_'+'a'.repeat(43);
  const r=await call('session',{headers:{Cookie:'views_guest_email='+token}});
  expect(await r.json()).toEqual({authenticated:false});expect(r.headers.get('set-cookie')).toContain('Max-Age=0');
  await call('session',{headers:{Cookie:'views_guest_email='+token+'; views_guest_email='+token}});expect(upstream).toHaveBeenCalledTimes(1);
 });
 it('does not forward malformed bodies, identity headers or arbitrary paths',async()=>{
  const upstream=vi.fn(),call=await fixture(upstream);
  for(const body of ['null','[]','{"email":"x@views.invalid","locale":"en","role":"admin"}']){
   expect((await call('request',{method:'POST',headers:{'Content-Type':'application/json'},body})).status).toBe(400);
  }
  expect((await call('request',{method:'POST',headers:{'Content-Type':'application/json','X-User-Id':'spoof'},body:'{}'})).status).toBe(403);
  expect((await call('session?upstream=staff')).status).toBe(404);expect(upstream).not.toHaveBeenCalled();
 });
 it('never follows upstream redirects or echoes raw upstream secrets',async()=>{
  const call=await fixture((_req,res)=>{res.writeHead(302,{Location:'http://127.0.0.1:9/'});res.end();});
  const r=await call('session',{headers:{Cookie:'views_guest_email=vges_'+'a'.repeat(43)}});
  expect(r.status).toBe(502);expect(await r.json()).toEqual({error:'GUEST_CORE_UNAVAILABLE'});
 });
});
