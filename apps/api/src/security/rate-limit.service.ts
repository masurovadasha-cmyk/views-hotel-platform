import {Injectable} from "@nestjs/common";
import type {PoolClient} from "pg";
import {DatabaseService} from "../database/database.service";

export class RateLimitExceededError extends Error{
  constructor(
    readonly retryAfterSeconds:number,
    readonly action:string
  ){
    super("RATE_LIMITED");
    this.name="RateLimitExceededError";
  }
}

type RateLimitRow={
  allowed:boolean;
  current_count:number;
  remaining:number;
  reset_at:Date;
};

@Injectable()
export class SecurityRateLimitService{
  constructor(private readonly db:DatabaseService){}

  async consume(
    action:string,
    keyHash:string,
    limit:number,
    windowSeconds:number,
    now=new Date()
  ){
    const result=await this.db.query<RateLimitRow>(
      "SELECT * FROM app.consume_security_rate_limit($1,$2,$3,$4,$5)",
      [action,keyHash,limit,windowSeconds,now]
    );
    return this.decision(action,result.rows[0],now);
  }

  async consumeWithClient(
    client:PoolClient,
    action:string,
    keyHash:string,
    limit:number,
    windowSeconds:number,
    now=new Date()
  ){
    const result=await client.query<RateLimitRow>(
      "SELECT * FROM app.consume_security_rate_limit($1,$2,$3,$4,$5)",
      [action,keyHash,limit,windowSeconds,now]
    );
    return this.decision(action,result.rows[0],now);
  }

  private decision(action:string,row:RateLimitRow|undefined,now:Date){
    if(!row)throw new Error("RATE_LIMIT_DECISION_MISSING");
    const resetAt=row.reset_at instanceof Date?row.reset_at:new Date(row.reset_at);
    const retryAfterSeconds=Math.max(
      1,Math.ceil((resetAt.getTime()-now.getTime())/1000)
    );
    if(!row.allowed)throw new RateLimitExceededError(retryAfterSeconds,action);
    return {
      allowed:true as const,
      currentCount:Number(row.current_count),
      remaining:Number(row.remaining),
      resetAt:resetAt.toISOString()
    };
  }
}
