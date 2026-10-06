import "reflect-metadata";
import {NestFactory} from "@nestjs/core";
import {AppModule} from "../app.module";
import {loadPaymeSandboxConfig} from "./payme-sandbox.config";
import {PaymeExpiryWorkerService} from "./payme-expiry-worker.service";

/** Explicit, one-shot staging maintenance. Does not bind a network listener. */
async function main(){
  const args=process.argv.slice(2);
  if(!args.includes("--ack=STAGING_EXPIRY_ONLY")||args.some(arg=>
    arg!=="--ack=STAGING_EXPIRY_ONLY"&&!/^--limit=\d+$/.test(arg)
  )||args.filter(arg=>arg.startsWith("--limit=")).length>1)throw new Error("PAYME_EXPIRY_ARGUMENTS_INVALID");
  const limit=Number(args.find(arg=>arg.startsWith("--limit="))?.split("=")[1]||50);
  if(!Number.isInteger(limit)||limit<1||limit>100)throw new Error("PAYME_EXPIRY_LIMIT_INVALID");
  if(!loadPaymeSandboxConfig()){
    process.stdout.write(JSON.stringify({mode:"sandbox",enabled:false,reason:"PAYME_SANDBOX_DISABLED"})+"\n");
    return;
  }
  const app=await NestFactory.createApplicationContext(AppModule,{logger:false,abortOnError:false});
  try{
    const report=await app.get(PaymeExpiryWorkerService).runCycle(limit);
    process.stdout.write(JSON.stringify(report)+"\n");
    if(report.failed||report.conflicts||report.busy||report.budgetExhausted)process.exitCode=1;
  }finally{await app.close();}
}
void main().catch(()=>{
  process.stderr.write(JSON.stringify({ok:false,error:"PAYME_EXPIRY_RUN_FAILED"})+"\n");
  process.exitCode=2;
});
