/** Windows/local rehearsal is opt-in and never an alternative production ingress. */
export function resolveListenHost(env:NodeJS.ProcessEnv=process.env):"127.0.0.1"|"0.0.0.0" {
  if(env.VIEWS_LOCAL_REHEARSAL!=="true")return "0.0.0.0";
  if(env.NODE_ENV!=="test"||env.VIEWS_ENV!=="local-rehearsal"||env.TRUSTED_PROXY_MODE!=="direct"){
    throw new Error("LOCAL_REHEARSAL_SCOPE_INVALID");
  }
  let db:URL;
  try{db=new URL(env.DATABASE_URL||"");}catch{throw new Error("LOCAL_REHEARSAL_DATABASE_INVALID");}
  if(!["postgres:","postgresql:"].includes(db.protocol)||db.hostname!=="127.0.0.1"||db.port!=="55432"||
      db.username!=="views_app"||db.pathname!=="/views_local"||db.search||db.hash){
    throw new Error("LOCAL_REHEARSAL_DATABASE_INVALID");
  }
  if(env.VIEWS_PAYME_MODE&&env.VIEWS_PAYME_MODE!=="sandbox")throw new Error("LOCAL_REHEARSAL_PROVIDER_INVALID");
  return "127.0.0.1";
}
