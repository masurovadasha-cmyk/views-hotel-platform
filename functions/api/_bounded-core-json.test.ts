import {describe,it,expect} from "vitest";
import {readBoundedJson} from "./_bounded-core-json";
describe("bounded Core JSON responses",()=>{
 it("parses small valid responses",async()=>{
  const data=await readBoundedJson(new Response(JSON.stringify({ok:true}),{headers:{"content-type":"application/json"}}));
  expect(data).toEqual({ok:true});
 });
 it("rejects declared oversized content before reading",async()=>{
  const response=new Response("{}",{headers:{"content-length":"99999"}});
  await expect(readBoundedJson(response,100)).rejects.toThrow("CORE_RESPONSE_TOO_LARGE");
 });
 it("rejects streamed bodies beyond byte limit even without content-length",async()=>{
  const body=new ReadableStream<Uint8Array>({start(c){c.enqueue(new Uint8Array(80));c.enqueue(new Uint8Array(80));c.close()}});
  await expect(readBoundedJson(new Response(body),100)).rejects.toThrow("CORE_RESPONSE_TOO_LARGE");
 });
 it("rejects invalid JSON",async()=>{
  await expect(readBoundedJson(new Response("{invalid"))).rejects.toThrow("CORE_INVALID_RESPONSE");
 });
 it("rejects invalid UTF-8",async()=>{
  await expect(readBoundedJson(new Response(new Uint8Array([255])))).rejects.toThrow("CORE_INVALID_RESPONSE");
 });
});
