import assert from "node:assert/strict";
import {mkdtemp,mkdir,writeFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join,dirname} from "node:path";
import {describe,it} from "vitest";
import {inspectCoreNetworkSource,scanCoreNetworkPrimitives} from "./core-network-primitive-gate.mjs";

const allowed=[
  'export const value=1;',
  'import type {IncomingHttpHeaders} from "node:http"; export type H=IncomingHttpHeaders;',
  'import type {Socket} from "node:net";',
  'type H=import("node:http").IncomingHttpHeaders;',
  'export type {IncomingHttpHeaders} from "node:http";',
  'import {isIP as classify,BlockList} from "node:net"; classify("127.0.0.1");',
  'import {\n isIPv4,\n isIPv6\n} from "net";',
  '// fetch("x"); import {request} from "https";\nconst message="fetch(";',
  'import {Pool} from "pg"; export const pool=new Pool();'
];
const blocked=[
  ['import {request} from "node:https";','DIRECT_HTTP_IMPORT_FORBIDDEN'],
  ['import {\n request as send\n} from "https";','DIRECT_HTTP_IMPORT_FORBIDDEN'],
  ['import {type IncomingHttpHeaders,request} from "node:http";','DIRECT_HTTP_IMPORT_FORBIDDEN'],
  ['import "http";','DIRECT_HTTP_IMPORT_FORBIDDEN'],
  ['export {request} from "node:http";','DIRECT_HTTP_IMPORT_FORBIDDEN'],
  ['export * from "node:https";','DIRECT_HTTP_IMPORT_FORBIDDEN'],
  ['const x=require("https");','DIRECT_HTTP_IMPORT_FORBIDDEN'],
  ['const x=import("node:http");','DIRECT_HTTP_IMPORT_FORBIDDEN'],
  ['import x = require("node:net");','DIRECT_NET_IMPORT_FORBIDDEN'],
  ['import {connect} from "node:net";','DIRECT_NET_IMPORT_FORBIDDEN'],
  ['import {isIP,Socket} from "net";','DIRECT_NET_IMPORT_FORBIDDEN'],
  ['import * as net from "net";','DIRECT_NET_IMPORT_FORBIDDEN'],
  ['import {\nconnect\n} from "net";','DIRECT_NET_IMPORT_FORBIDDEN'],
  ['export {connect} from "net";','DIRECT_NET_IMPORT_FORBIDDEN'],
  ['fetch("https://example.com");','DIRECT_FETCH_FORBIDDEN'],
  ['const send=fetch;','DIRECT_FETCH_FORBIDDEN'],
  ['globalThis["fetch"]("https://example.com");','DIRECT_FETCH_FORBIDDEN'],
  ['const {fetch:send}=globalThis;','DIRECT_FETCH_FORBIDDEN'],
  ['new WebSocket("wss://example.com");','DIRECT_WEBSOCKET_FORBIDDEN'],
  ['const WS=globalThis.WebSocket;','DIRECT_WEBSOCKET_FORBIDDEN'],
  ['new EventSource("https://example.com");','DIRECT_EVENTSOURCE_FORBIDDEN'],
  ['import axios from "axios";','DIRECT_HTTP_CLIENT_PACKAGE_FORBIDDEN'],
  ['const x=require("undici");','DIRECT_HTTP_CLIENT_PACKAGE_FORBIDDEN'],
  ['import "axios/unsafe/adapters/http.js";','DIRECT_HTTP_CLIENT_PACKAGE_FORBIDDEN'],
  ['import {lookup} from "node:dns/promises";','DIRECT_DNS_IMPORT_FORBIDDEN'],
  ['import {connect} from "node:tls";','DIRECT_TLS_IMPORT_FORBIDDEN'],
  ['import {createSocket} from "dgram";','DIRECT_DGRAM_IMPORT_FORBIDDEN'],
  ['import {exec} from "child_process";','NETWORK_ESCAPE_MODULE_FORBIDDEN'],
  ['const net=process.getBuiltinModule("net");','NETWORK_ESCAPE_MODULE_FORBIDDEN'],
  ['eval("1");','DYNAMIC_CODE_FORBIDDEN'],
  ['const fn=new Function("return 1");','DYNAMIC_CODE_FORBIDDEN'],
  ['const x=import(moduleName);','DYNAMIC_MODULE_SPECIFIER_FORBIDDEN'],
  ['export const = ;','SOURCE_PARSE_FAILED']
];

describe("AST network primitive policy",()=>{
  for(const [index,source] of allowed.entries())it(`allows non-network case ${index+1}`,()=>{
    assert.deepEqual(inspectCoreNetworkSource(source),[]);
  });
  for(const [index,[source,code]] of blocked.entries())it(`blocks runtime case ${index+1}: ${code}`,()=>{
    assert.ok(inspectCoreNetworkSource(source).some(x=>x.code===code));
  });
  it("scans production code but keeps tests and reserved egress code separate",async()=>{
    const root=await mkdtemp(join(tmpdir(),"views-ast-"));
    try{
      for(const [path,content] of Object.entries({
        "security/client.ts":'import {isIP} from "node:net";',
        "security/guard.ts":'import type {IncomingHttpHeaders} from "node:http";',
        "security/egress/future.ts":'fetch("https://example.com");',
        "booking/example.test.ts":'fetch("https://example.com");'
      })){
        const full=join(root,path);
        await mkdir(dirname(full),{recursive:true});
        await writeFile(full,content);
      }
      const result=await scanCoreNetworkPrimitives(root);
      assert.equal(result.ok,true);
      assert.equal(result.scannedFiles,2);
    }finally{await rm(root,{recursive:true,force:true})}
  });
  it("does not report an empty source tree as passing",async()=>{
    const root=await mkdtemp(join(tmpdir(),"views-ast-empty-"));
    try{await assert.rejects(scanCoreNetworkPrimitives(root),/CORE_SOURCE_FILES_REQUIRED/)}
    finally{await rm(root,{recursive:true,force:true})}
  });
});
