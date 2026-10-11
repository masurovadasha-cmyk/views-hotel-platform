import {describe,expect,it} from "vitest";
import {createCoreServiceToken} from "./_core-service-token";

const NOW=1_800_000_000;
const encoder=new TextEncoder();

describe("Pages signed Core service token",()=>{
  it("mints a short-lived request-bound Ed25519 token",async()=>{
    const keys=await generateSigningKeys();
    const token=await createCoreServiceToken({
      serviceId:"pages-bff",
      kid:"pages-2026-10",
      privateKeyPem:keys.privatePem,
      method:"GET",
      path:"/v1/analytics/dashboard/summary?ignored=true",
      requestId:"cf-ray-stage7-fixture",
      nowSeconds:NOW
    });

    const parts=token.split(".");
    expect(parts).toHaveLength(3);
    expect(decodeJson(parts[0])).toEqual({
      alg:"EdDSA",
      typ:"views-service+jwt",
      kid:"pages-2026-10"
    });
    expect(decodeJson(parts[1])).toMatchObject({
      iss:"pages-bff",
      sub:"pages-bff",
      aud:"views-core",
      iat:NOW,
      exp:NOW+30,
      htm:"GET",
      htp:"/v1/analytics/dashboard/summary",
      rid:"cf-ray-stage7-fixture"
    });

    await expect(crypto.subtle.verify(
      {name:"Ed25519"},
      keys.publicKey,
      decodeBytes(parts[2]),
      encoder.encode(parts[0]+"."+parts[1])
    )).resolves.toBe(true);
  });

  it("rejects invalid signing configuration and request bindings",async()=>{
    const keys=await generateSigningKeys();

    await expect(createCoreServiceToken({
      serviceId:"Bad Service",
      kid:"pages-2026-10",
      privateKeyPem:keys.privatePem,
      method:"GET",
      path:"/v1/test",
      requestId:"req-1"
    })).rejects.toThrow("CORE_SERVICE_ID_INVALID");

    await expect(createCoreServiceToken({
      serviceId:"pages-bff",
      kid:"bad kid",
      privateKeyPem:keys.privatePem,
      method:"GET",
      path:"/v1/test",
      requestId:"req-1"
    })).rejects.toThrow("CORE_SIGNING_KID_INVALID");

    await expect(createCoreServiceToken({
      serviceId:"pages-bff",
      kid:"pages-2026-10",
      privateKeyPem:"not-a-private-key",
      method:"GET",
      path:"/v1/test",
      requestId:"req-1"
    })).rejects.toThrow("CORE_SIGNING_PRIVATE_KEY_INVALID");
  });
});

async function generateSigningKeys(){
  const pair=await crypto.subtle.generateKey(
    {name:"Ed25519"},
    true,
    ["sign","verify"]
  ) as CryptoKeyPair;
  const pkcs8=await crypto.subtle.exportKey("pkcs8",pair.privateKey);
  return {
    privatePem:toPem("PRIVATE KEY",new Uint8Array(pkcs8)),
    publicKey:pair.publicKey
  };
}

function decodeJson(segment:string){
  return JSON.parse(new TextDecoder().decode(decodeBytes(segment))) as Record<string,unknown>;
}

function decodeBytes(value:string){
  const padded=value.replace(/-/g,"+").replace(/_/g,"/")+
    "=".repeat((4-value.length%4)%4);
  const binary=atob(padded);
  return Uint8Array.from(binary,char=>char.charCodeAt(0));
}

function toPem(label:string,bytes:Uint8Array){
  let binary="";
  for(const byte of bytes)binary+=String.fromCharCode(byte);
  const base64=btoa(binary);
  const lines=base64.match(/.{1,64}/g)?.join("\n")||base64;
  return "-----BEGIN "+label+"-----\n"+lines+"\n-----END "+label+"-----";
}
