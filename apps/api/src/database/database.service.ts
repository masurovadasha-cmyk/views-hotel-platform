import {Injectable,OnModuleDestroy} from "@nestjs/common";
import {Pool,PoolClient,QueryResultRow} from "pg";
import {loadConfig} from "../config";
import type {RequestActorContext} from "../identity/actor-context";

@Injectable()
export class DatabaseService implements OnModuleDestroy{
 private readonly pool=new Pool({connectionString:loadConfig().databaseUrl,max:20});

 async query<T extends QueryResultRow>(sql:string,params:unknown[]=[]){return this.pool.query<T>(sql,params)}

 async withActor<T>(actor:RequestActorContext,work:(client:PoolClient)=>Promise<T>):Promise<T>{
  const client=await this.pool.connect();
  try{
   await client.query("BEGIN");
   await client.query("SELECT set_config('app.organization_id',$1,true),set_config('app.user_id',$2,true),set_config('app.membership_id',$3,true)",[actor.organizationId,actor.userId,actor.membershipId]);
   const result=await work(client);
   await client.query("COMMIT");
   return result;
  }catch(error){await client.query("ROLLBACK");throw error}
  finally{client.release()}
 }

 async withOrganization<T>(organizationId:string,work:(client:PoolClient)=>Promise<T>):Promise<T>{
  const client=await this.pool.connect();
  try{
   await client.query("BEGIN");
   await client.query("SELECT set_config('app.organization_id',$1,true)",[organizationId]);
   const result=await work(client);
   await client.query("COMMIT");
   return result;
  }catch(error){await client.query("ROLLBACK");throw error}
  finally{client.release()}
 }

 async ping(){await this.pool.query("SELECT 1")}
 async onModuleDestroy(){await this.pool.end()}
}
