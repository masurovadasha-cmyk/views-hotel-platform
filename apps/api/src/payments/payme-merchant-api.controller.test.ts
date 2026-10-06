import {afterEach,describe,expect,it} from "vitest";
import {assertPaymeRequestIdentity} from "./payme-merchant-api.controller";
import {
  PAYME_SOURCE_CIDRS,
  loadPaymeSourceCidrs
} from "./payme-sandbox.config";

const base:NodeJS.ProcessEnv={
  NODE_ENV:"test",
  DATABASE_URL:"postgresql://fixture",
  TRUSTED_PROXY_MODE:"direct",
  VIEWS_PAYME_SANDBOX_ENABLED:"true",
  VIEWS_PAYME_MODE:"sandbox",
  VIEWS_PAYME_ORGANIZATION_ID:"73000000-0000-4000-8000-000000000001",
  VIEWS_PAYME_MERCHANT_ID:"0123456789abcdef01234567",
  VIEWS_PAYME_MERCHANT_LOGIN:"views-payme-test",
  VIEWS_PAYME_TEST_KEY:"fixture-test-key-0123456789abcdef",
  VIEWS_PAYME_TEST_SOURCE_CIDRS_JSON:'["172.30.0.0/29"]'
};
const auth="Basic "+Buffer.from(
  "views-payme-test:fixture-test-key-0123456789abcdef"
).toString("base64");

afterEach(()=>undefined);

describe("Payme Merchant API identity",()=>{
  it("requires both approved source and Basic credentials",()=>{
    expect(assertPaymeRequestIdentity(
      {socket:{remoteAddress:"172.30.0.5"},headers:{}},
      auth,
      {...base}
    )).toBe(true);

    expect(assertPaymeRequestIdentity(
      {socket:{remoteAddress:"172.30.0.5"},headers:{}},
      "Basic "+Buffer.from("views-payme-test:wrong").toString("base64"),
      {...base}
    )).toBe(false);

    expect(assertPaymeRequestIdentity(
      {socket:{remoteAddress:"172.30.0.20"},headers:{}},
      auth,
      {...base}
    )).toBe(false);
  });

  it("does not permit test CIDR override in production",()=>{
    const ranges=loadPaymeSourceCidrs({
      ...base,
      NODE_ENV:"production"
    });
    expect(ranges).toEqual(PAYME_SOURCE_CIDRS);
    expect(ranges).not.toContain("172.30.0.0/29");
  });
});
