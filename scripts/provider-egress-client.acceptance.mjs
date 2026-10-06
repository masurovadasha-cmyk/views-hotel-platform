import assert from 'node:assert/strict';
import {test, before, after} from 'node:test';
import {mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
const require = createRequire(import.meta.url);
const build = path.resolve(process.env.VIEWS_EGRESS_TEST_BUILD || '.egress-test-build');
const {ProviderRegistry, EgressError} = require(path.join(build, 'provider-policy.js'));
const {ProviderEgressClient} = require(path.join(build, 'provider-egress-client.js'));
const {HttpsRelayTransport} = require(path.join(build, 'https-relay-transport.js'));
const requestId = '11111111-2222-4333-8444-555555555555';
const call = (extra={}) => ({providerId:'fixture', operationId:'status', requestId, ...extra});
const policy = (extra={}) => ({id:'fixture', enabled:true, origin:'https://api.provider.test',
  credentialRef:'FIXTURE_AUTH', timeoutMs:2000, maxRequestBytes:1024, maxResponseBytes:4096,
  operations:{status:{method:'GET',path:'/status',queryKeys:['id']},
    create:{method:'POST',path:'/create',requireIdempotencyKey:true}}, ...extra});
const secret = 'Bearer fixture-sensitive-token';
const ok = () => ({status:200,contentType:'application/json',body:Buffer.from('{"ok":true}')});
function fake(extra={}) {
  const events=[]; const calls=[];
  const transport=extra.transport || {send:async(...args)=>{calls.push(args);return ok();}};
  const client=new ProviderEgressClient(new ProviderRegistry([policy(extra.policy)]),transport,
    extra.credentials || (()=>secret),extra.audit || {write:async e=>{events.push(e);}},extra.maxInFlight || 16);
  return {client,events,calls};
}
const fails = code => e => e instanceof EgressError && e.code===code && e.retryable===false;

test('default registry cannot enable an external provider',()=>{
  assert.throws(()=>new ProviderRegistry().plan(call()),fails('EGRESS_PROVIDER_DISABLED'));
});
for (const origin of ['http://api.provider.test','https://127.0.0.1','https://[::1]',
  'https://2130706433','https://api.provider.test:443','https://api.provider.test:8443',
  'https://user:password@api.provider.test','https://api.provider.test/path',
  'https://api.provider.test?x=1','https://api.provider.test#fragment',
  'https://metadata.google.internal','https://service.local','https://localhost']) {
  test('rejects unsafe policy origin '+origin,()=>assert.throws(()=>new ProviderRegistry([policy({origin})]),fails('EGRESS_ORIGIN_INVALID')));
}
for (const value of ['//other.example','/../admin','/a/%2e%2e/x','/status?x=1','/status#x','/a\\b']) {
  test('rejects unbound operation path '+value,()=>{
    assert.throws(()=>new ProviderRegistry([policy({operations:{status:{method:'GET',path:value}}})]),fails('EGRESS_OPERATION_INVALID'));
  });
}
test('policy copies are immutable after registry creation',()=>{
  const p=policy(); const r=new ProviderRegistry([p]); p.origin='https://evil.test'; p.operations.status.path='/elsewhere';
  assert.equal(r.plan(call()).hostname,'api.provider.test'); assert.equal(r.plan(call()).path,'/status');
});
test('unknown operation and inherited property are denied',()=>{
  const r=new ProviderRegistry([policy()]);
  for(const operationId of ['other','constructor'])assert.throws(()=>r.plan(call({operationId})),fails('EGRESS_OPERATION_DENIED'));
});
test('caller query values cannot change the approved path or authority',()=>{
  const plan=new ProviderRegistry([policy()]).plan(call({query:{id:'//evil.test/?a=1&b=2'}}));
  assert.equal(plan.hostname,'api.provider.test'); assert.equal(plan.path,'/status?id=%2F%2Fevil.test%2F%3Fa%3D1%26b%3D2');
});
test('unapproved query key and control characters are denied',()=>{
  const r=new ProviderRegistry([policy()]);
  assert.throws(()=>r.plan(call({query:{redirect:'https://evil.test'}})),fails('EGRESS_QUERY_DENIED'));
  assert.throws(()=>r.plan(call({query:{id:'abc\r\nHost: bad'}})),fails('EGRESS_QUERY_DENIED'));
});
test('POST requires explicit idempotency key and GET forbids a body',()=>{
  const r=new ProviderRegistry([policy()]);
  assert.throws(()=>r.plan(call({operationId:'create',body:{a:1}})),fails('EGRESS_IDEMPOTENCY_REQUIRED'));
  assert.throws(()=>r.plan(call({body:{a:1}})),fails('EGRESS_BODY_DENIED'));
});
test('JSON request size uses UTF-8 bytes, not character count',()=>{
  const r=new ProviderRegistry([policy({maxRequestBytes:20})]);
  assert.throws(()=>r.plan(call({operationId:'create',idempotencyKey:'order-123',body:{text:'я'.repeat(20)}})),fails('EGRESS_REQUEST_TOO_LARGE'));
});
test('cyclic and getter JSON bodies never reach the transport',async()=>{
  const f=fake(); const cycle={};cycle.self=cycle;
  await assert.rejects(f.client.execute(call({operationId:'create',idempotencyKey:'order-123',body:cycle})),fails('EGRESS_JSON_INVALID'));
  let getterRan=false; const value={get amount(){getterRan=true;return 1;}};
  await assert.rejects(f.client.execute(call({operationId:'create',idempotencyKey:'order-123',body:value})),fails('EGRESS_JSON_INVALID'));
  assert.equal(getterRan,false); assert.equal(f.calls.length,0);
});
test('credential failures and CRLF credentials fail before dispatch',async()=>{
  for(const credentials of [()=>undefined,()=>{throw Error(secret);},()=>secret+'\r\nX-Evil:yes']) {
    const f=fake({credentials}); await assert.rejects(f.client.execute(call()),fails('EGRESS_CREDENTIAL_UNAVAILABLE'));assert.equal(f.calls.length,0);
  }
});
test('audit output excludes token, query values, URL and payload',async()=>{
  const f=fake();await f.client.execute(call({operationId:'create',idempotencyKey:'order-123',body:{passport:'private-document'}}));
  const encoded=JSON.stringify(f.events);
  assert.equal(f.events[0].event,'started');assert.equal(f.events[1].event,'completed');
  for(const value of [secret,'private-document','order-123','https://','/create'])assert.ok(!encoded.includes(value));
});
test('audit failure before dispatch prevents side effects',async()=>{
  const f=fake({audit:{write:async()=>{throw Error(secret);}}});
  await assert.rejects(f.client.execute(call()),e=>fails('EGRESS_AUDIT_FAILED')(e)&&e.delivery==='not-sent');assert.equal(f.calls.length,0);
});
test('audit failure after response never grants automatic retry permission',async()=>{
  let count=0;const f=fake({audit:{write:async()=>{if(++count===2)throw Error('store unavailable');}}});
  await assert.rejects(f.client.execute(call()),e=>fails('EGRESS_AUDIT_FAILED')(e)&&e.delivery==='response');assert.equal(f.calls.length,1);
});
test('no automatic retry on 503 or transport failure, including POST',async()=>{
  let attempts=0;const f=fake({transport:{send:async()=>{attempts++;throw Error(secret);}}});
  await assert.rejects(f.client.execute(call({operationId:'create',idempotencyKey:'order-123',body:{amount:1}})),fails('EGRESS_TRANSPORT_FAILED'));
  assert.equal(attempts,1);assert.ok(!JSON.stringify(f.events).includes(secret));
  const g=fake({transport:{send:async()=>{attempts++;return {...ok(),status:503};}}});
  assert.equal((await g.client.execute(call())).status,503);assert.equal(attempts,2);
});
test('single deadline covers a transport that ignores cancellation',async()=>{
  const f=fake({policy:{timeoutMs:100},transport:{send:()=>new Promise(()=>{})}});
  await assert.rejects(f.client.execute(call()),fails('EGRESS_DEADLINE'));
});
test('pre-aborted call does not acquire a credential or dispatch',async()=>{
  const f=fake();const control=new AbortController();control.abort();
  await assert.rejects(f.client.execute(call(),control.signal),fails('EGRESS_ABORTED'));assert.equal(f.calls.length,0);
});
test('in-flight concurrency is bounded and released after cancellation',async()=>{
  let pending=true;const f=fake({maxInFlight:1,transport:{send:()=>pending?new Promise(()=>{}):Promise.resolve(ok())}});
  const control=new AbortController();const first=f.client.execute(call(),control.signal);
  await assert.rejects(f.client.execute(call()),fails('EGRESS_BUSY'));control.abort();
  await assert.rejects(first,fails('EGRESS_ABORTED'));pending=false;assert.equal((await f.client.execute(call())).status,200);
});

let proxy, origin, dir, certificate;
const sockets=new Set();
let proxyMode='allow', responseMode='json', connections=[], received=[];
function track(server){server.on('connection',socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));});}
async function listen(server){await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});return server.address().port;}
before(async()=>{
  dir=mkdtempSync(path.join(tmpdir(),'views-egress-tls-'));
  execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-days','1','-subj','/CN=api.provider.test',
    '-addext','subjectAltName=DNS:api.provider.test','-keyout',path.join(dir,'key.pem'),'-out',path.join(dir,'cert.pem')],{stdio:'ignore'});
  certificate=readFileSync(path.join(dir,'cert.pem'),'utf8');
  origin=https.createServer({key:readFileSync(path.join(dir,'key.pem')),cert:certificate},(req,res)=>{
    const chunks=[];req.on('data',chunk=>chunks.push(chunk));req.on('end',()=>{
      received.push({url:req.url,host:req.headers.host,auth:req.headers.authorization,sni:req.socket.servername,body:Buffer.concat(chunks).toString()});
      if(responseMode==='stall')return;
      if(responseMode==='redirect'){res.writeHead(302,{location:'http://169.254.169.254/'});res.end();return;}
      if(responseMode==='gzip'){res.writeHead(200,{'content-type':'application/json','content-encoding':'gzip'});res.end('data');return;}
      if(responseMode==='html'){res.writeHead(200,{'content-type':'text/html'});res.end('data');return;}
      if(responseMode==='large'){res.writeHead(200,{'content-type':'application/json','content-length':'10000'});res.end('x'.repeat(10000));return;}
      if(responseMode==='chunked'){res.writeHead(200,{'content-type':'application/json'});res.write('x'.repeat(5000));res.end();return;}
      if(responseMode==='partial'){res.writeHead(200,{'content-type':'application/json','content-length':'100'});res.flushHeaders();res.write('{');setImmediate(()=>res.destroy());return;}
      res.writeHead(responseMode==='503'?503:200,{'content-type':'application/json','set-cookie':'do-not-propagate=1'});res.end('{"ok":true}');
    });
  });track(origin);await listen(origin);
  proxy=http.createServer();track(proxy);
  proxy.on('connect',(req,socket,head)=>{
    connections.push({target:req.url,auth:req.headers.authorization});
    if(proxyMode==='deny'){socket.end('HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\n\r\n');return;}
    if(proxyMode==='stall')return;
    if(proxyMode==='extra'){socket.end('HTTP/1.1 200 Connected\r\n\r\nbogus');return;}
    const upstream=net.connect(origin.address().port,'127.0.0.1',()=>{
      socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if(head.length)upstream.write(head);socket.pipe(upstream).pipe(socket);
    });
    sockets.add(upstream);upstream.on('close',()=>sockets.delete(upstream));
    upstream.on('error',()=>socket.destroy());socket.on('error',()=>upstream.destroy());
    socket.on('close',()=>upstream.destroy());upstream.on('close',()=>socket.destroy());
  });await listen(proxy);
});
after(async()=>{
  for(const socket of sockets)socket.destroy();
  await Promise.all([proxy,origin].filter(Boolean).map(server=>new Promise(resolve=>server.close(resolve))));
  if(dir)rmSync(dir,{recursive:true,force:true});
});
function real(options={}) {
  proxyMode=options.proxyMode || 'allow';responseMode=options.responseMode || 'json';connections=[];received=[];
  const events=[];
  const transport=new HttpsRelayTransport({host:'127.0.0.1',port:proxy.address().port,...(options.noCa?{}:{ca:certificate})});
  return {events,client:new ProviderEgressClient(new ProviderRegistry([policy(options.policy)]),transport,()=>secret,{write:async e=>events.push(e)})};
}
test('real CONNECT + verified TLS preserves Host/SNI and keeps auth off proxy',async()=>{
  const f=real();const response=await f.client.execute(call());
  assert.equal(response.status,200);assert.deepEqual(JSON.parse(response.body),{ok:true});
  assert.deepEqual(connections,[{target:'api.provider.test:443',auth:undefined}]);
  assert.equal(received[0].host,'api.provider.test');assert.equal(received[0].sni,'api.provider.test');assert.equal(received[0].auth,secret);
  assert.equal(response.headers,undefined);assert.ok(!JSON.stringify(f.events).includes(secret));
});
test('real POST sends JSON and explicit idempotency key once',async()=>{
  const f=real();await f.client.execute(call({operationId:'create',idempotencyKey:'order-123',body:{amount:123}}));
  assert.equal(connections.length,1);assert.equal(received[0].body,'{"amount":123}');assert.equal(received[0].url,'/create');
});
test('untrusted TLS certificate is rejected before authorization leaves client',async()=>{
  const f=real({noCa:true});await assert.rejects(f.client.execute(call()),fails('EGRESS_TLS_FAILED'));assert.equal(received.length,0);
});
test('wrong certificate hostname is rejected without disabling TLS verification',async()=>{
  const f=real({policy:{origin:'https://wrong.provider.test'}});
  await assert.rejects(f.client.execute(call()),fails('EGRESS_TLS_FAILED'));assert.equal(received.length,0);
});
test('proxy 403 never falls back to direct Internet',async()=>{
  const f=real({proxyMode:'deny'});await assert.rejects(f.client.execute(call()),fails('EGRESS_PROXY_DENIED'));
  assert.equal(connections.length,1);assert.equal(received.length,0);
});
test('unexpected bytes after CONNECT headers are denied',async()=>{
  const f=real({proxyMode:'extra'});await assert.rejects(f.client.execute(call()),fails('EGRESS_PROXY_PROTOCOL'));assert.equal(received.length,0);
});
test('origin redirect to metadata is not followed',async()=>{
  const f=real({responseMode:'redirect'});await assert.rejects(f.client.execute(call()),fails('EGRESS_REDIRECT_BLOCKED'));assert.equal(connections.length,1);
});
for(const [responseMode,code] of [['gzip','EGRESS_ENCODING_DENIED'],['html','EGRESS_CONTENT_TYPE_DENIED'],
  ['large','EGRESS_RESPONSE_TOO_LARGE'],['chunked','EGRESS_RESPONSE_TOO_LARGE'],['partial','EGRESS_RESPONSE_INCOMPLETE']]) {
  test('response limits: '+responseMode,async()=>{
    const f=real({responseMode});await assert.rejects(f.client.execute(call()),fails(code));
  });
}
test('total deadline destroys a stalled CONNECT',async()=>{
  const f=real({proxyMode:'stall',policy:{timeoutMs:150}});await assert.rejects(f.client.execute(call()),fails('EGRESS_DEADLINE'));
});
test('total deadline destroys a stalled origin response',async()=>{
  const f=real({responseMode:'stall',policy:{timeoutMs:150}});await assert.rejects(f.client.execute(call()),fails('EGRESS_DEADLINE'));
});
test('real 503 is returned once for adapter reconciliation, not retried',async()=>{
  const f=real({responseMode:'503'});assert.equal((await f.client.execute(call())).status,503);assert.equal(connections.length,1);
});
