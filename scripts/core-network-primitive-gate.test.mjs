import {mkdtemp,mkdir,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {describe,expect,it} from "vitest";
import {scanCoreNetworkPrimitives} from "./core-network-primitive-gate.mjs";

async function fixture(files){
  const root=await mkdtemp(join(tmpdir(),"views-egress-gate-"));
  for(const [path,content] of Object.entries(files)){
    const full=join(root,path);
    const dir=full.slice(0,full.lastIndexOf("/"));
    await mkdir(dir,{recursive:true});
    await writeFile(full,content,"utf8");
  }
  return root;
}

describe("Core network primitive gate",()=>{
  it("accepts ordinary application code",async()=>{
    const root=await fixture({
      "booking/service.ts":"export const value=1;"
    });
    const result=await scanCoreNetworkPrimitives(root);
    expect(result.ok).toBe(true);
  });

  it("blocks direct fetch outside the egress boundary",async()=>{
    const root=await fixture({
      "payments/adapter.ts":
        'export async function call(){return fetch("https://example.com")}'
    });
    const result=await scanCoreNetworkPrimitives(root);
    expect(result.findings).toContainEqual({
      code:"DIRECT_FETCH_FORBIDDEN",
      file:"payments/adapter.ts"
    });
  });

  it("blocks direct network packages outside the egress boundary",async()=>{
    const root=await fixture({
      "payments/adapter.ts":
        'import axios from "axios"; export const client=axios;'
    });
    const result=await scanCoreNetworkPrimitives(root);
    expect(result.findings).toContainEqual({
      code:"DIRECT_HTTP_CLIENT_PACKAGE_FORBIDDEN",
      file:"payments/adapter.ts"
    });
  });

  it("allows future centralized egress implementation to own networking",async()=>{
    const root=await fixture({
      "security/egress/client.ts":
        'export async function call(){return fetch("https://example.com")}'
    });
    const result=await scanCoreNetworkPrimitives(root);
    expect(result.ok).toBe(true);
  });

  it("allows only non-socket node:net use in network-cidr helper",async()=>{
    const safe=await fixture({
      "security/network-cidr.ts":
        'import {BlockList,isIP} from "node:net"; export {BlockList,isIP};'
    });
    expect((await scanCoreNetworkPrimitives(safe)).ok).toBe(true);

    const unsafe=await fixture({
      "security/network-cidr.ts":
        'import {connect} from "node:net"; export const x=()=>connect(80);'
    });
    expect((await scanCoreNetworkPrimitives(unsafe)).findings)
      .toContainEqual({
        code:"NETWORK_CIDR_NET_USAGE_EXPANDED",
        file:"security/network-cidr.ts"
      });
  });
});
