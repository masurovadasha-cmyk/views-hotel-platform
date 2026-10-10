import {describe,expect,it} from "vitest";
import {OUTBOX_LEASE_SECONDS,OUTBOX_MAX_ATTEMPTS,nextAvailableAt,outboxBackoffSeconds,outboxFailureDecision,outboxLeaseExpiresAt,parseOutboxPayload} from "./_outbox";

describe("outbox recovery",()=>{
  it("uses bounded exponential-ish backoff",()=>{
    expect(outboxBackoffSeconds(1)).toBe(30);
    expect(outboxBackoffSeconds(2)).toBe(120);
    expect(outboxBackoffSeconds(3)).toBe(600);
    expect(outboxBackoffSeconds(99)).toBe(3600);
  });

  it("parses object payloads and rejects invalid payloads",()=>{
    expect(parseOutboxPayload('{"id":"x"}')).toEqual({id:"x"});
    expect(()=>parseOutboxPayload("not-json")).toThrow();
    expect(()=>parseOutboxPayload('"scalar"')).toThrow();
  });

  it("computes deterministic retry timestamps",()=>{
    expect(nextAvailableAt(1,0)).toBe("1970-01-01T00:00:30.000Z");
    expect(OUTBOX_MAX_ATTEMPTS).toBe(5);
  });

  it("dead-letters only at the configured maximum attempt",()=>{
    expect(outboxFailureDecision(4,0)).toEqual({deadLetter:false,availableAt:"1970-01-01T00:30:00.000Z"});
    expect(outboxFailureDecision(5,0)).toEqual({deadLetter:true,availableAt:null});
    expect(outboxFailureDecision(9,0)).toEqual({deadLetter:true,availableAt:null});
  });

  it("uses a short deterministic processing lease",()=>{
    expect(OUTBOX_LEASE_SECONDS).toBe(120);
    expect(outboxLeaseExpiresAt(0)).toBe("1970-01-01T00:02:00.000Z");
  });
});
