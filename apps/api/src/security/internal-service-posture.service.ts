import {Injectable} from "@nestjs/common";
import {loadConfig,type ConfiguredInternalServicePublicKey} from "../config";
import {DatabaseService} from "../database/database.service";
import type {RequestActorContext} from "../identity/actor-context";

export type InternalServicePostureRow={
  service_id:string;
  auth_scheme:"internal_key"|"signed_token";
  credential_id:string|null;
  key_fingerprint:string;
  request_count:string;
  first_seen_at:Date;
  last_seen_at:Date;
};

export type InternalServicePostureInput={
  rows:readonly InternalServicePostureRow[];
  serviceKeys:Readonly<Record<string,readonly string[]>>;
  servicePublicKeys:Readonly<Record<string,readonly ConfiguredInternalServicePublicKey[]>>;
  hours:number;
  now:Date;
};

type PostureAlert={
  code:
    |"LEGACY_INTERNAL_KEY_TRAFFIC"
    |"SIGNED_SERVICE_TRAFFIC_MISSING"
    |"SIGNED_CREDENTIAL_ROTATION_DUE_SOON"
    |"SIGNED_CREDENTIAL_ROTATION_OVERDUE"
    |"SIGNED_CREDENTIAL_ROTATION_METADATA_MISSING";
  serviceId:string;
  credentialId:string|null;
};

const MAX_HOURS=24*90;
const ROTATION_DUE_SOON_MS=14*24*60*60*1000;

@Injectable()
export class InternalServicePostureService{
  constructor(private readonly db:DatabaseService){}

  async get(
    actor:RequestActorContext,
    hours=24,
    now=new Date()
  ){
    validateHours(hours);
    if(!Number.isFinite(now.getTime())){
      throw new Error("INVALID_INTERNAL_SERVICE_POSTURE_TIME");
    }

    const since=new Date(now.getTime()-hours*60*60*1000);
    const rows=await this.db.withActor(actor,async client=>{
      const sql=[
        "SELECT service_id,auth_scheme,credential_id,key_fingerprint,",
        "request_count,first_seen_at,last_seen_at",
        "FROM app.internal_service_auth_posture($1::timestamptz)"
      ].join(" ");
      return (await client.query<InternalServicePostureRow>(
        sql,
        [since.toISOString()]
      )).rows;
    });

    const config=loadConfig();
    return buildInternalServicePosture({
      rows,
      serviceKeys:config.internalServiceKeys,
      servicePublicKeys:config.internalServicePublicKeys,
      hours,
      now
    });
  }
}

export function buildInternalServicePosture(
  input:InternalServicePostureInput
){
  validateHours(input.hours);
  const nowMs=input.now.getTime();
  if(!Number.isFinite(nowMs)){
    throw new Error("INVALID_INTERNAL_SERVICE_POSTURE_TIME");
  }

  const since=new Date(nowMs-input.hours*60*60*1000);
  const serviceIds=new Set<string>([
    ...Object.keys(input.serviceKeys),
    ...Object.keys(input.servicePublicKeys),
    ...input.rows.map(row=>row.service_id)
  ]);

  const services=[...serviceIds].sort().map(serviceId=>{
    const rows=input.rows.filter(row=>row.service_id===serviceId);
    const signed=rows.filter(row=>row.auth_scheme==="signed_token");
    const legacy=rows.filter(row=>row.auth_scheme==="internal_key");
    const signedRequestCount=sumRequests(signed);
    const legacyRequestCount=sumRequests(legacy);

    return {
      serviceId,
      signedRequestCount,
      legacyRequestCount,
      lastSignedAt:maxDate(signed.map(row=>row.last_seen_at)),
      lastLegacyAt:maxDate(legacy.map(row=>row.last_seen_at)),
      ready:signedRequestCount>0&&legacyRequestCount===0
    };
  });

  const credentials=Object.entries(input.servicePublicKeys)
    .flatMap(([serviceId,keys])=>keys.map(key=>{
      const rows=input.rows.filter(row=>
        row.service_id===serviceId&&
        row.auth_scheme==="signed_token"&&
        row.credential_id===key.kid
      );
      const activatedAt=key.activatedAt;
      const rotateBy=key.rotateBy;
      const activatedMs=activatedAt?Date.parse(activatedAt):NaN;
      const rotateMs=rotateBy?Date.parse(rotateBy):NaN;

      let status:"healthy"|"due_soon"|"overdue"|"metadata_missing";
      if(!Number.isFinite(activatedMs)||!Number.isFinite(rotateMs)){
        status="metadata_missing";
      }else if(nowMs>=rotateMs){
        status="overdue";
      }else if(rotateMs-nowMs<=ROTATION_DUE_SOON_MS){
        status="due_soon";
      }else{
        status="healthy";
      }

      return {
        serviceId,
        credentialId:key.kid,
        activatedAt,
        rotateBy,
        ageDays:Number.isFinite(activatedMs)
          ?roundDays(nowMs-activatedMs)
          :null,
        daysUntilRotation:Number.isFinite(rotateMs)
          ?roundDays(rotateMs-nowMs)
          :null,
        status,
        observed:{
          requestCount:sumRequests(rows),
          firstSeenAt:minDate(rows.map(row=>row.first_seen_at)),
          lastSeenAt:maxDate(rows.map(row=>row.last_seen_at)),
          keyFingerprints:[...new Set(rows.map(row=>row.key_fingerprint))].sort()
        }
      };
    }))
    .sort((a,b)=>
      a.serviceId.localeCompare(b.serviceId)||
      a.credentialId.localeCompare(b.credentialId)
    );

  const alerts:PostureAlert[]=[];

  for(const service of services){
    if(service.legacyRequestCount>0){
      alerts.push({
        code:"LEGACY_INTERNAL_KEY_TRAFFIC",
        serviceId:service.serviceId,
        credentialId:null
      });
    }
    if(service.signedRequestCount===0){
      alerts.push({
        code:"SIGNED_SERVICE_TRAFFIC_MISSING",
        serviceId:service.serviceId,
        credentialId:null
      });
    }
  }

  for(const credential of credentials){
    const code:PostureAlert["code"]|null=
      credential.status==="overdue"
        ?"SIGNED_CREDENTIAL_ROTATION_OVERDUE"
        :credential.status==="due_soon"
          ?"SIGNED_CREDENTIAL_ROTATION_DUE_SOON"
          :credential.status==="metadata_missing"
            ?"SIGNED_CREDENTIAL_ROTATION_METADATA_MISSING"
            :null;
    if(code){
      alerts.push({
        code,
        serviceId:credential.serviceId,
        credentialId:credential.credentialId
      });
    }
  }

  return {
    schemaVersion:1,
    generatedAt:input.now.toISOString(),
    window:{
      hours:input.hours,
      since:since.toISOString()
    },
    migration:{
      ready:services.length>0&&services.every(service=>service.ready),
      services
    },
    credentials,
    alerts
  };
}

function validateHours(hours:number){
  if(!Number.isInteger(hours)||hours<1||hours>MAX_HOURS){
    throw new Error("INVALID_INTERNAL_SERVICE_POSTURE_HOURS");
  }
}

function sumRequests(rows:readonly InternalServicePostureRow[]){
  return rows.reduce((sum,row)=>{
    const count=Number(row.request_count);
    if(!Number.isSafeInteger(count)||count<0){
      throw new Error("INVALID_INTERNAL_SERVICE_POSTURE_COUNT");
    }
    return sum+count;
  },0);
}

function minDate(values:readonly Date[]){
  if(values.length===0)return null;
  return new Date(Math.min(...values.map(value=>value.getTime()))).toISOString();
}

function maxDate(values:readonly Date[]){
  if(values.length===0)return null;
  return new Date(Math.max(...values.map(value=>value.getTime()))).toISOString();
}

function roundDays(milliseconds:number){
  return Math.round(milliseconds/86_400)/1000;
}
