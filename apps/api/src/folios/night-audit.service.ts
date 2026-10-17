import {ConflictException,Injectable} from '@nestjs/common';
import {createHash,randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import {DatabaseService} from '../database/database.service';
import type {RequestActorContext} from '../identity/actor-context';
import {auditInput,day,id} from './folio.input';
import {enabled,mode,openFolio,record,replay,scope} from './folio.store';
import {nightlyAllocation,type NightSource} from './nightly-allocation';
type AuditReceipt={runId:string;propertyId:string;businessDate:string;reservationCount:number;postedCount:number;zeroAmountCount:number;totals:{currency:string;amountMinor:string}[];idempotentReplay:boolean;accountingMode:typeof mode};
type Candidate={id:string;unit_id:string;property_id:string;confirmation_code:string;currency:string;status:string;total_minor:string;check_in_date:string;check_out_date:string;quote_snapshot:{pricingSnapshot?:{propertyTimezone?:string;nightlyDates?:string[]}}};
type Prepared={stay:Candidate;source:NightSource;allocation:ReturnType<typeof nightlyAllocation>;sourceValid:boolean};
@Injectable()
export class NightAuditService{
 constructor(private readonly db:DatabaseService){}
 private async state(c:PoolClient,a:RequestActorContext,property:string,date:string,write=false){
  await scope(c,a,property,write);
  const p=(await c.query<{timezone:string;today:string}>(`SELECT timezone,(clock_timestamp() AT TIME ZONE timezone)::date::text today FROM properties WHERE id=$1 AND organization_id=$2 ${write?'FOR SHARE':''}`,[property,a.organizationId])).rows[0];
  if(date>=p.today)throw new ConflictException('NIGHT_AUDIT_DATE_NOT_CLOSED');
  // No LIMIT: one explicit run examines the whole selected property/day.
  const rows=(await c.query<Candidate>(`SELECT r.id,r.unit_id,r.property_id,r.confirmation_code,r.currency,r.status,r.total_minor::text,(r.check_in_at AT TIME ZONE $3)::date::text check_in_date,(r.check_out_at AT TIME ZONE $3)::date::text check_out_date,r.quote_snapshot FROM reservations r WHERE r.organization_id=$1 AND r.property_id=$2 AND r.status IN ('confirmed','checked_in','checked_out') AND (r.check_in_at AT TIME ZONE $3)::date<=$4::date AND (r.check_out_at AT TIME ZONE $3)::date>$4::date ORDER BY r.id ${write?'FOR UPDATE OF r':''}`,[a.organizationId,property,p.timezone,date])).rows;
  const prepared:Prepared[]=[];
  for(const stay of rows){const lines=(await c.query(`SELECT id,line_type AS "lineType",code,amount_minor::text AS "amountMinor",currency,metadata FROM reservation_price_lines WHERE reservation_id=$1 ORDER BY sort_order,id ${write?'FOR SHARE':''}`,[stay.id])).rows as NightSource['lines'];
   const source:NightSource={reservationId:stay.id,currency:stay.currency,totalMinor:stay.total_minor,checkInDate:stay.check_in_date,checkOutDate:stay.check_out_date,timezone:p.timezone,lines};
   let allocation:Prepared['allocation']=[],sourceValid=true;
   const occupancy=(await c.query(`SELECT organization_id,property_id,unit_id,kind,(lower(stay_period) AT TIME ZONE $2)::date::text start_date,(upper(stay_period) AT TIME ZONE $2)::date::text end_date FROM inventory_periods WHERE reservation_id=$1 ${write?'FOR SHARE':''}`,[stay.id,p.timezone])).rows;
   if(occupancy.length!==1||occupancy[0].organization_id!==a.organizationId||occupancy[0].property_id!==property||occupancy[0].unit_id!==stay.unit_id||occupancy[0].kind!=='reservation'||occupancy[0].start_date!==stay.check_in_date||occupancy[0].end_date!==stay.check_out_date)sourceValid=false;
   try{allocation=nightlyAllocation(source);if(stay.quote_snapshot.pricingSnapshot?.propertyTimezone!==p.timezone||JSON.stringify(stay.quote_snapshot.pricingSnapshot.nightlyDates)!==JSON.stringify(allocation.map(x=>x.businessDate)))sourceValid=false;}catch{sourceValid=false;}
   const previous=(await c.query('SELECT source_snapshot=$2::jsonb same FROM folio_nightly_plans WHERE reservation_id=$1',[stay.id,source])).rows[0];
   if(previous&&!previous.same)sourceValid=false;
   prepared.push({stay,source,allocation,sourceValid});
  }
  const revision=createHash('sha256').update(JSON.stringify({propertyId:property,businessDate:date,timezone:p.timezone,rows:prepared.map(x=>({status:x.stay.status==='confirmed'?'confirmed':'occupied',source:x.source,sourceValid:x.sourceValid,quote:x.stay.quote_snapshot.pricingSnapshot}))})).digest('hex');
  const run=(await c.query(`SELECT id,reservation_count AS "reservationCount",posted_count AS "postedCount",zero_amount_count AS "zeroAmountCount",totals,created_at AS "createdAt",revision FROM folio_night_audits WHERE organization_id=$1 AND property_id=$2 AND business_date=$3`,[a.organizationId,property,date])).rows[0]??null;
  return {propertyId:property,businessDate:date,timezone:p.timezone,run,revision,eligibleCount:rows.filter(r=>r.status!=='confirmed').length,unresolvedCount:rows.filter(r=>r.status==='confirmed').length,invalidSnapshotCount:prepared.filter(r=>!r.sourceValid).length,scopeChanged:Boolean(run&&run.revision!==revision),accountingMode:mode,prepared};
 }
 async inspect(a:RequestActorContext,property:unknown,date:unknown){enabled();const p=id(property),d=day(date);return this.db.withActor(a,async c=>{const {prepared,...view}=await this.state(c,a,p,d);return view;});}
 async run(a:RequestActorContext,key:unknown,raw:unknown){enabled();const input=auditInput(raw),command=id(key),payload={type:'night_audit',...input};return this.db.withActor(a,async c=>{
  const prior=await replay<AuditReceipt>(c,a,input.propertyId,command,payload);if(prior)return prior;
  await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['folio-night:'+a.organizationId+':'+input.propertyId]);
  const current=await this.state(c,a,input.propertyId,input.businessDate,true);
  if(current.revision!==input.expectedRevision)throw new ConflictException('NIGHT_AUDIT_STALE');
  if(current.unresolvedCount)throw new ConflictException('NIGHT_AUDIT_UNRESOLVED_ARRIVALS');
  if(current.invalidSnapshotCount||current.scopeChanged)throw new ConflictException('NIGHT_AUDIT_RECONCILIATION_REQUIRED');
  if(current.run){const result={runId:current.run.id,propertyId:input.propertyId,businessDate:input.businessDate,reservationCount:current.run.reservationCount,postedCount:current.run.postedCount,zeroAmountCount:current.run.zeroAmountCount,totals:current.run.totals,idempotentReplay:true,accountingMode:mode};await record(c,a,input.propertyId,command,payload,result,'folio.night_audit_replayed',current.run.id);return result;}
  const runId=randomUUID(),totals=new Map<string,bigint>();let postedCount=0,zeroAmountCount=0;
  for(const row of current.prepared){const allocation=row.allocation.find(n=>n.businessDate===input.businessDate);if(!allocation)throw new ConflictException('NIGHT_AUDIT_RECONCILIATION_REQUIRED');
   await c.query('INSERT INTO folio_nightly_plans(organization_id,property_id,reservation_id,currency,source_snapshot,allocations) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(reservation_id) DO NOTHING',[a.organizationId,input.propertyId,row.stay.id,row.stay.currency,row.source,JSON.stringify(row.allocation)]);
   const amount=BigInt(allocation.amountMinor);totals.set(row.stay.currency,(totals.get(row.stay.currency)??0n)+amount);
   if(amount===0n){zeroAmountCount++;continue;}
   const folio=await openFolio(c,a,row.stay);
   await c.query(`INSERT INTO folio_entries(organization_id,property_id,folio_id,currency,kind,amount_minor,label,source_type,source_id,idempotency_key,policy_snapshot,business_date) VALUES($1,$2,$3,$4,'accommodation',$5,$6,'night_audit',$7,$8,$9,$10)`,[a.organizationId,input.propertyId,folio,row.stay.currency,allocation.amountMinor,{ru:'Проживание '+input.businessDate,uz:'Turar joy '+input.businessDate,en:'Accommodation '+input.businessDate},allocation.sourceLineId,'folio-night:'+allocation.sourceLineId,{schemaVersion:1,accountingMode:mode,scope:'net_accommodation_only',runId,timezone:current.timezone},input.businessDate]);postedCount++;
  }
  const sum=[...totals].sort(([a],[b])=>a.localeCompare(b)).map(([currency,amount])=>({currency,amountMinor:amount.toString()}));
  await c.query('INSERT INTO folio_night_audits(id,organization_id,property_id,business_date,timezone,revision,reservation_count,posted_count,zero_amount_count,totals,actor_user_id,actor_membership_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',[runId,a.organizationId,input.propertyId,input.businessDate,current.timezone,current.revision,current.prepared.length,postedCount,zeroAmountCount,JSON.stringify(sum),a.userId,a.membershipId]);
  const result={runId,propertyId:input.propertyId,businessDate:input.businessDate,reservationCount:current.prepared.length,postedCount,zeroAmountCount,totals:sum,idempotentReplay:false,accountingMode:mode};await record(c,a,input.propertyId,command,payload,result,'folio.night_audit_posted',runId);return result;
 });}
}
