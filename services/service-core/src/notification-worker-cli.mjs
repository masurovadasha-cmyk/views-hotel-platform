import {Pool} from "pg";
import {enqueueNotificationEvents,processNotificationJobs} from "./notification-worker.mjs";

const organizationId=process.env.VIEWS_WORKER_ORGANIZATION_ID;
if(!process.env.DATABASE_URL||!organizationId||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(organizationId)){
 throw Error("DATABASE_URL and VIEWS_WORKER_ORGANIZATION_ID UUID required");
}
const pollMs=Number(process.env.VIEWS_NOTIFICATION_POLL_MS||5000);
if(!Number.isSafeInteger(pollMs)||pollMs<1000||pollMs>60000)throw Error("Invalid notification polling interval");
const pool=new Pool({connectionString:process.env.DATABASE_URL,max:3,connectionTimeoutMillis:5000});
let running=true;
process.on("SIGINT",()=>{running=false});
process.on("SIGTERM",()=>{running=false});
try{
 while(running){
  try{
   await enqueueNotificationEvents(pool,{organizationId,limit:100});
   const result=await processNotificationJobs(pool,{organizationId,limit:50});
   if(result.dead)console.error("VIEWS notification projection dead-letter count:",result.dead);
  }catch(error){
   console.error("VIEWS notification worker cycle failed:",error?.code||"unknown");
  }
  if(running)await new Promise(resolve=>setTimeout(resolve,pollMs));
 }
}finally{await pool.end()}
