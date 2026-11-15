'use strict';
// In-process local rehearsal only; never installs a cron job or background service.
module.exports=async function({db,expire,env=process.env,intervalMs=1000,onError=code=>console.error(code)}){
 const enabled=()=>env.NODE_ENV==='test'&&env.VIEWS_LOCAL_REHEARSAL==='true'&&env.VIEWS_DEMO_SMS==='true';
 if(!enabled())throw Error('DEMO_HOLD_EXPIRY_DISABLED');
 if(!Number.isInteger(intervalMs)||intervalMs<5||intervalMs>60000)throw Error('DEMO_HOLD_EXPIRY_INTERVAL_INVALID');
 const result=await db.query("SELECT shobj_description(oid,'pg_database') marker FROM pg_database WHERE datname=current_database()");
 if(result.rows[0]?.marker!=='VIEWS_DISPOSABLE_CORE_TEST')throw Error('DEMO_HOLD_EXPIRY_DISPOSABLE_DATABASE_REQUIRED');
 // Only the two organizations in the existing disposable seed, never tenant discovery.
 const organizations=['00000000-0000-0000-0000-000000000001','10000000-0000-4000-8000-000000000001'];
 let stopped=false,timer,pending;
 const tick=async()=>{
  try{for(const org of organizations){if(stopped||!enabled())break;await expire(org,100);}}
  catch{onError('DEMO_HOLD_EXPIRY_FAILED');}
  finally{if(!stopped)timer=setTimeout(()=>{pending=tick();},intervalMs);}
 };
 pending=tick();
 return {async stop(){stopped=true;clearTimeout(timer);await pending;}};
};
