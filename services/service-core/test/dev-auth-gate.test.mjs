import test from "node:test";
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";

test("DB API fails closed when development authentication is not explicitly enabled",()=>{
 const result=spawnSync(process.execPath,["--input-type=module","-e","import('./src/db-server.mjs')"],{
  cwd:fileURLToPath(new URL("..",import.meta.url)),
  env:{...process.env,DATABASE_URL:"postgresql://invalid:invalid@127.0.0.1:5432/invalid",VIEWS_AUTH_SECRET:"a".repeat(40),VIEWS_ALLOW_DEV_AUTH:"0"},
  encoding:"utf8",timeout:10000
 });
 assert.notEqual(result.status,0);
 assert.match(result.stderr,/Development authentication is disabled/);
});
