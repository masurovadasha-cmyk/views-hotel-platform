import {json,requestId,requireDatabase,type Env} from "./_shared";
import {requireMutationOrigin,resolveSession} from "./_auth";
import {isManagement} from "./_authorization";
import {OUTBOX_CONSUMER,OUTBOX_MAX_ATTEMPTS,nextAvailableAt,parseOutboxPayload} from "./_outbox";

export const onRequestPost=async({request,env}:{request:Request;env:Env})=>{
  const originError=requireMutationOrigin(request,env);if(originError)return originError;
  const session=await resolveSession(request,env);
  if(!session||session.mode!=="staff")return json({error:"STAFF_AUTH_REQUIRED",requestId:requestId(request)},401);
  if(!isManagement(session.role))return json({error:"FORBIDDEN",requestId:requestId(request)},403);

  let db;try{db=requireDatabase(env)}catch{return json({error:"DATABASE_NOT_BOUND",requestId:requestId(request)},503)}

  const body=await request.json().catch(()=>({})) as Record<string,unknown>;
  const requested=Number(body.limit??25);
  const limit=Number.isInteger(requested)?Math.max(1,Math.min(50,requested)):25;

  const rows=await db.prepare([
    "SELECT id,organization_id,event_type,aggregate_type,aggregate_id,payload,attempt_count ",
    "FROM outbox_events ",
    "WHERE organization_id=? AND processed_at IS NULL AND dead_letter_at IS NULL ",
    "AND datetime(available_at)<=CURRENT_TIMESTAMP ",
    "ORDER BY created_at ASC LIMIT ?"
  ].join("")).bind(session.organizationId,limit).all();

  let processed=0,retried=0,deadLettered=0;
  const failures:Array<{id:string;error:string;attempt:number}>=[];

  for(const raw of rows.results||[]){
    const event=raw as Record<string,unknown>;
    const id=String(event.id);
    const attempt=Number(event.attempt_count||0)+1;

    try{
      parseOutboxPayload(String(event.payload||""));

      const result=await db.batch([
        db.prepare([
          "INSERT OR IGNORE INTO outbox_deliveries(",
          "id,outbox_event_id,consumer,event_type,aggregate_type,aggregate_id,payload",
          ") VALUES(?,?,?,?,?,?,?)"
        ].join(""))
          .bind(
            crypto.randomUUID(),id,OUTBOX_CONSUMER,String(event.event_type),
            String(event.aggregate_type),String(event.aggregate_id),String(event.payload)
          ),
        db.prepare([
          "UPDATE outbox_events SET processed_at=CURRENT_TIMESTAMP,last_attempt_at=CURRENT_TIMESTAMP,",
          "attempt_count=?,last_error=NULL WHERE id=? AND organization_id=? ",
          "AND processed_at IS NULL AND dead_letter_at IS NULL"
        ].join("")).bind(attempt,id,session.organizationId)
      ]);
      if(result[1]?.meta?.changes)processed++;
    }catch(error){
      const message=String(error instanceof Error?error.message:error).slice(0,500);
      if(attempt>=OUTBOX_MAX_ATTEMPTS){
        await db.prepare([
          "UPDATE outbox_events SET attempt_count=?,last_attempt_at=CURRENT_TIMESTAMP,last_error=?,",
          "dead_letter_at=CURRENT_TIMESTAMP WHERE id=? AND organization_id=? AND processed_at IS NULL"
        ].join("")).bind(attempt,message,id,session.organizationId).run();
        deadLettered++;
      }else{
        await db.prepare([
          "UPDATE outbox_events SET attempt_count=?,last_attempt_at=CURRENT_TIMESTAMP,last_error=?,",
          "available_at=? WHERE id=? AND organization_id=? AND processed_at IS NULL AND dead_letter_at IS NULL"
        ].join("")).bind(attempt,message,nextAvailableAt(attempt),id,session.organizationId).run();
        retried++;
      }
      failures.push({id,error:message,attempt});
    }
  }

  const remaining=await db.prepare(
    "SELECT COUNT(*) AS count FROM outbox_events WHERE organization_id=? AND processed_at IS NULL AND dead_letter_at IS NULL"
  ).bind(session.organizationId).first<{count:number}>();

  return json({
    processed,retried,deadLettered,
    remaining:Number(remaining?.count||0),
    failures,
    requestId:requestId(request)
  });
};
