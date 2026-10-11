import assert from "node:assert/strict";
import {createServer} from "node:http";
import {once} from "node:events";
import {spawnSync} from "node:child_process";
import {readFileSync} from "node:fs";
import {describe,it} from "vitest";
import {probeNetwork} from "./core-egress-probe.mjs";

async function withServer(fn){
  const server=createServer((_req,res)=>{res.writeHead(503);res.end()});
  server.listen(0,"127.0.0.1");
  await once(server,"listening");
  try{await fn(server.address().port)}
  finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}
}

describe("egress probe evidence",()=>{
  it("proves the probe executes and reaches a known TCP listener",async()=>{
    await withServer(async port=>{
      const value=await probeNetwork("tcp","127.0.0.1",port);
      assert.equal(value.attempted,true);assert.equal(value.outcome,"connected");
    });
  });
  it("treats HTTP 503 as reachable, never as isolated",async()=>{
    await withServer(async port=>{
      const value=await probeNetwork("http",`http://127.0.0.1:${port}/`);
      assert.equal(value.outcome,"connected");assert.equal(value.status,503);
    });
  });
  it("records a refused TCP socket explicitly",async()=>{
    let closedPort;
    await withServer(async port=>{closedPort=port});
    const value=await probeNetwork("tcp","127.0.0.1",closedPort);
    assert.equal(value.outcome,"unreachable");assert.equal(value.errorCode,"ECONNREFUSED");
  });
  for(const code of ["ENOTFOUND","EAI_AGAIN","CERT_HAS_EXPIRED","UNKNOWN"]){
    it(`does not treat ${code} as proof of isolation`,async()=>{
      const value=await probeNetwork("http","https://example.com/",null,100,
        async()=>{throw Object.assign(new Error("fixture"),{cause:{code}})});
      assert.equal(value.outcome,"error");assert.equal(value.errorCode,code);
    });
  }
  it("accepts a bounded transport timeout as unreachable",async()=>{
    const value=await probeNetwork("http","https://example.com/",null,100,
      async()=>{throw Object.assign(new Error("fixture"),{name:"TimeoutError"})});
    assert.equal(value.outcome,"unreachable");
  });
  it("rejects malformed probe input",async()=>{
    await assert.rejects(probeNetwork("tcp","localhost",0),/INVALID_TCP/);
    await assert.rejects(probeNetwork("http","https://user:secret@example.com/"),/INVALID_HTTP/);
    await assert.rejects(probeNetwork("tcp","localhost",80,0),/INVALID_PROBE_TIMEOUT/);
  });
  it("requires actual stdin execution evidence",()=>{
    const code=readFileSync(new URL("./core-egress-probe.mjs",import.meta.url),"utf8");
    const executed=spawnSync(process.execPath,["--input-type=module","-","tcp","127.0.0.1","1","100"],{input:code,encoding:"utf8"});
    assert.equal(executed.status,0);
    assert.equal(JSON.parse(executed.stdout).attempted,true);
    const empty=spawnSync(process.execPath,["--input-type=module","-","tcp","127.0.0.1","1","100"],{input:"",encoding:"utf8"});
    assert.equal(empty.status,0);
    assert.throws(()=>JSON.parse(empty.stdout));
  });
});
