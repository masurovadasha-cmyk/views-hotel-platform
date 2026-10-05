import {afterAll,describe,expect,it} from "vitest";
import {DatabaseService} from "../database/database.service";
import {RateLimitExceededError,SecurityRateLimitService} from "./rate-limit.service";

const db=new DatabaseService();
const limits=new SecurityRateLimitService(db);

describe.sequential("distributed security rate limits",()=>{
  it("shares one atomic counter and blocks after the configured limit",async()=>{
    const action="test.guest-auth."+crypto.randomUUID();
    const key="d".repeat(64);
    const now=new Date("2030-01-01T00:00:10.000Z");

    const first=await limits.consume(action,key,2,60,now);
    expect(first.currentCount).toBe(1);
    expect(first.remaining).toBe(1);

    const second=await limits.consume(action,key,2,60,now);
    expect(second.currentCount).toBe(2);
    expect(second.remaining).toBe(0);

    await expect(limits.consume(action,key,2,60,now))
      .rejects.toBeInstanceOf(RateLimitExceededError);
  });

  it("uses independent keys and windows",async()=>{
    const action="test.guest-auth."+crypto.randomUUID();
    const keyA="e".repeat(64);
    const keyB="f".repeat(64);

    const a=await limits.consume(action,keyA,1,60,new Date("2030-01-01T00:00:10.000Z"));
    const b=await limits.consume(action,keyB,1,60,new Date("2030-01-01T00:00:10.000Z"));
    const next=await limits.consume(action,keyA,1,60,new Date("2030-01-01T00:01:10.000Z"));

    expect(a.currentCount).toBe(1);
    expect(b.currentCount).toBe(1);
    expect(next.currentCount).toBe(1);
  });
});

afterAll(async()=>{await db.onModuleDestroy()});
