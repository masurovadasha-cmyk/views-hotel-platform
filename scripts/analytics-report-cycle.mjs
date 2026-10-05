import {
  createPrivateKey,
  randomUUID,
  sign as signMessage
} from "node:crypto";
import {pathToFileURL} from "node:url";

const SERVICE_ID="analytics-cron";
const CORE_PATH="/v1/internal/analytics/report-cycle";
const TOKEN_TYP="views-service+jwt";
const TOKEN_AUD="views-core";
const TOKEN_TTL_SECONDS=30;
const KID=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;
const REQUEST_ID=/^[A-Za-z0-9._:/-]{1,160}$/;
const MACHINE_CODE=/^[A-Z][A-Z0-9_:-]{1,119}$/;

export class AnalyticsCronError extends Error{
  constructor(code,status=null){
    super(code);
    this.name="AnalyticsCronError";
    this.code=code;
    this.status=status;
  }
}

export function loadAnalyticsCronConfig(env=process.env){
  const rawUrl=String(env.VIEWS_CORE_API_URL||"").trim();
  if(!rawUrl)throw new AnalyticsCronError("CORE_API_NOT_CONFIGURED");

  let parsed;
  try{parsed=new URL(rawUrl)}
  catch{throw new AnalyticsCronError("CORE_API_URL_INVALID")}

  if(
    parsed.username||
    parsed.password||
    parsed.hash||
    parsed.search||
    (parsed.pathname!=="/"&&parsed.pathname!=="")
  ){
    throw new AnalyticsCronError("CORE_API_URL_INVALID");
  }
  if(!["https:","http:"].includes(parsed.protocol)){
    throw new AnalyticsCronError("CORE_API_URL_INVALID");
  }
  if(env.VIEWS_ENV==="production"&&parsed.protocol!=="https:"){
    throw new AnalyticsCronError("CORE_API_URL_INSECURE");
  }

  const kid=String(env.VIEWS_ANALYTICS_CRON_SIGNING_KID||"").trim();
  if(!KID.test(kid)){
    throw new AnalyticsCronError("ANALYTICS_CRON_SIGNING_KID_INVALID");
  }

  const privateKeyPem=String(
    env.VIEWS_ANALYTICS_CRON_SIGNING_PRIVATE_KEY||""
  ).trim();
  if(!privateKeyPem){
    throw new AnalyticsCronError("ANALYTICS_CRON_SIGNING_KEY_NOT_CONFIGURED");
  }

  const privateKey=parseEd25519PrivateKey(privateKeyPem);

  return {
    baseUrl:parsed.origin,
    kid,
    privateKey
  };
}

export function createAnalyticsCronToken(input){
  const {
    kid,
    privateKey,
    requestId,
    nowSeconds=Math.floor(Date.now()/1000)
  }=input;

  if(!KID.test(kid)){
    throw new AnalyticsCronError("ANALYTICS_CRON_SIGNING_KID_INVALID");
  }
  if(!REQUEST_ID.test(requestId)){
    throw new AnalyticsCronError("ANALYTICS_CRON_REQUEST_ID_INVALID");
  }
  if(!Number.isInteger(nowSeconds)||nowSeconds<1){
    throw new AnalyticsCronError("ANALYTICS_CRON_CLOCK_INVALID");
  }

  const header={
    alg:"EdDSA",
    typ:TOKEN_TYP,
    kid
  };
  const claims={
    iss:SERVICE_ID,
    sub:SERVICE_ID,
    aud:TOKEN_AUD,
    iat:nowSeconds,
    exp:nowSeconds+TOKEN_TTL_SECONDS,
    jti:randomUUID(),
    htm:"POST",
    htp:CORE_PATH,
    rid:requestId
  };

  const encodedHeader=base64Url(
    Buffer.from(JSON.stringify(header),"utf8")
  );
  const encodedClaims=base64Url(
    Buffer.from(JSON.stringify(claims),"utf8")
  );
  const signingInput=encodedHeader+"."+encodedClaims;
  const signature=signMessage(
    null,
    Buffer.from(signingInput,"utf8"),
    privateKey
  );

  return signingInput+"."+base64Url(signature);
}

export async function runAnalyticsReportCycle(options={}){
  const env=options.env??process.env;
  const fetchImpl=options.fetchImpl??fetch;
  const requestId=options.requestId??randomUUID();
  const nowSeconds=options.nowSeconds??Math.floor(Date.now()/1000);
  const config=loadAnalyticsCronConfig(env);
  const body=normalizeLimits(options);

  const token=createAnalyticsCronToken({
    kid:config.kid,
    privateKey:config.privateKey,
    requestId,
    nowSeconds
  });
  const url=new URL(CORE_PATH,config.baseUrl);

  let response;
  try{
    response=await fetchImpl(url,{
      method:"POST",
      redirect:"error",
      headers:{
        "Accept":"application/json",
        "Content-Type":"application/json",
        "X-Views-Service-Id":SERVICE_ID,
        "X-Views-Service-Token":token,
        "X-Request-Id":requestId
      },
      body:JSON.stringify(body),
      signal:options.signal??AbortSignal.timeout(15_000)
    });
  }catch(error){
    if(error instanceof AnalyticsCronError)throw error;
    throw new AnalyticsCronError("ANALYTICS_CRON_CORE_UNAVAILABLE");
  }

  const text=await response.text();
  if(!response.ok){
    throw new AnalyticsCronError(
      safeUpstreamErrorCode(text),
      response.status
    );
  }

  let data;
  try{data=JSON.parse(text)}
  catch{throw new AnalyticsCronError("ANALYTICS_CRON_INVALID_RESPONSE",502)}

  return {
    requestId,
    status:response.status,
    result:data
  };
}

function normalizeLimits(options){
  return {
    scheduleLimit:boundedInteger(
      options.scheduleLimit??20,1,100,"INVALID_REPORT_SCHEDULE_LIMIT"
    ),
    reportLimit:boundedInteger(
      options.reportLimit??20,1,100,"INVALID_REPORT_JOB_LIMIT"
    ),
    pruneLimit:boundedInteger(
      options.pruneLimit??1000,1,10000,"INVALID_REPORT_PRUNE_LIMIT"
    )
  };
}

function boundedInteger(value,min,max,code){
  const number=Number(value);
  if(!Number.isInteger(number)||number<min||number>max){
    throw new AnalyticsCronError(code);
  }
  return number;
}

function parseEd25519PrivateKey(pem){
  let key;
  try{key=createPrivateKey(pem)}
  catch{throw new AnalyticsCronError("ANALYTICS_CRON_SIGNING_KEY_INVALID")}
  if(key.asymmetricKeyType!=="ed25519"){
    throw new AnalyticsCronError("ANALYTICS_CRON_SIGNING_KEY_INVALID");
  }
  return key;
}

function base64Url(value){
  return Buffer.from(value).toString("base64url");
}

function safeUpstreamErrorCode(text){
  try{
    const parsed=JSON.parse(text);
    const candidates=[parsed?.error,parsed?.message];
    for(const candidate of candidates){
      if(typeof candidate==="string"&&MACHINE_CODE.test(candidate)){
        return candidate;
      }
    }
  }catch{}
  return "ANALYTICS_CRON_CORE_ERROR";
}

async function main(){
  try{
    const output=await runAnalyticsReportCycle({
      scheduleLimit:process.env.VIEWS_ANALYTICS_CRON_SCHEDULE_LIMIT,
      reportLimit:process.env.VIEWS_ANALYTICS_CRON_REPORT_LIMIT,
      pruneLimit:process.env.VIEWS_ANALYTICS_CRON_PRUNE_LIMIT
    });
    process.stdout.write(JSON.stringify({
      ok:true,
      requestId:output.requestId,
      status:output.status,
      result:output.result
    })+"\n");
  }catch(error){
    const code=error instanceof AnalyticsCronError
      ?error.code
      :"ANALYTICS_CRON_UNEXPECTED_ERROR";
    const status=error instanceof AnalyticsCronError
      ?error.status
      :null;
    process.stderr.write(JSON.stringify({ok:false,error:code,status})+"\n");
    process.exitCode=1;
  }
}

const entry=process.argv[1]
  ?pathToFileURL(process.argv[1]).href
  :null;
if(entry&&import.meta.url===entry){
  await main();
}
