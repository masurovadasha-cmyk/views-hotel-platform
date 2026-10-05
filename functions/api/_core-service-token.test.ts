import {generateKeyPairSync,verify} from "node:crypto";
import {describe,expect,it} from "vitest";
import {createCoreServiceToken} from "./_core-service-token";

const keys=generateKeyPairSync("ed25519");
const privatePem=keys.privateKey.export({format:"pem",type:"pkcs8"}).toString();
const NOW=1_800_000_000;

function decode(segment:string){
  return JSON.parse(Buffer.from(segment,"base64url").toString("utf8")) as Record<string,unknown>;
}

describe("Pages signed Core service token",()=>{
  it("mints a short-lived request-bound Ed25519 token",async()=>{
    const token=await createCoreServiceToken({
      serviceId:"pages-bff",
      kid:"pages-2026-10",
      privateKeyPem:privatePem,
      method:"GET",
      path:"/v1/analytics/dashboard/summary?ignored=true",
      requestId:"cf-ray-stage7-fixture",
      nowSeconds:NOW
    });

    const parts=token.split(".");
    expect(parts).toHaveLength(3);
    expect(decode(parts[0])).toEqual({
      alg:"EdDSA",
      typ:"views-service+jwt",
      kid:"pages-2026-10"
    });
    expect(decode(parts[1])).toMatchObject({
      iss:"pages-bff",
      sub:"pages-bff",
      aud:"views-core",
      iat:NOW,
      exp:NOW+30,
      htm:"GET",
      htp:"/v1/analytics/dashboard/summary",
      rid:"cf-ray-stage7-fixture"
    });

    expect(verify(
      null,
      Buffer.from(parts[0]+"."+parts[1]),
      keys.publicKey,
      Buffer.from(parts[2],"base64url")
    )).toBe(true);
  });

  it("rejects invalid signing configuration and request bindings",async()=>{
    await expect(createCoreServiceToken({
      serviceId:"Bad Service",
      kid:"pages-2026-10",
      privateKeyPem:privatePem,
      method:"GET",
      path:"/v1/test",
      requestId:"req-1"
    })).rejects.toThrow("CORE_SERVICE_ID_INVALID");

    await expect(createCoreServiceToken({
      serviceId:"pages-bff",
      kid:"bad kid",
      privateKeyPem:privatePem,
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
