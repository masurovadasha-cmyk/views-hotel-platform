import {ConflictException,Injectable} from '@nestjs/common';
import {DatabaseService} from '../database/database.service';
import type {RequestActorContext} from '../identity/actor-context';
import {chargeInput,cursor,id,nextCursor,reversalInput} from './folio.input';
import {booking,enabled,entryId,mode,openFolio,record,replay,scope} from './folio.store';
type Receipt={entryId:string;folioId:string;reservationId:string;idempotentReplay:boolean};
const projection=`f.id,r.id AS "reservationId",r.confirmation_code AS "confirmationCode",r.currency,COALESCE(f.status,'not_opened') status,
 COALESCE((SELECT sum(e.amount_minor) FROM folio_entries e WHERE e.folio_id=f.id),0)::text AS "balanceMinor",
 (SELECT count(*)::int FROM folio_entries e WHERE e.folio_id=f.id) AS "entryCount"`;
@Injectable()
export class FolioService{
 constructor(private readonly db:DatabaseService){}
 async properties(a:RequestActorContext,raw?:unknown){enabled();const bound='folio-properties:'+a.organizationId,after=cursor(raw,bound);return this.db.withActor(a,async c=>{const rows=(await c.query(`SELECT id,name,timezone FROM properties WHERE organization_id=$1 AND app.folio_operation_access(organization_id,id,false) AND ($2::uuid IS NULL OR id>$2) ORDER BY id LIMIT 51`,[a.organizationId,after])).rows;return {items:rows.slice(0,50),nextCursor:rows.length>50?nextCursor(bound,rows[49].id):null};});}
 async list(a:RequestActorContext,property:unknown,raw?:unknown){enabled();const p=id(property),bound='folios:'+p,after=cursor(raw,bound);return this.db.withActor(a,async c=>{await scope(c,a,p);const rows=(await c.query(`SELECT ${projection} FROM reservations r LEFT JOIN guest_folios f ON f.reservation_id=r.id AND f.organization_id=r.organization_id WHERE r.organization_id=$1 AND r.property_id=$2 AND (r.status IN ('confirmed','checked_in','checked_out') OR f.id IS NOT NULL) AND ($3::uuid IS NULL OR r.id>$3) ORDER BY r.id LIMIT 51`,[a.organizationId,p,after])).rows;return {items:rows.slice(0,50),nextCursor:rows.length>50?nextCursor(bound,rows[49].reservationId):null,accountingMode:mode};});}
 async detail(a:RequestActorContext,target:unknown,raw?:unknown){enabled();const r=id(target),bound='folio-entries:'+r,after=cursor(raw,bound);return this.db.withActor(a,async c=>{await booking(c,a,r);const folio=(await c.query(`SELECT ${projection} FROM reservations r LEFT JOIN guest_folios f ON f.reservation_id=r.id AND f.organization_id=r.organization_id WHERE r.id=$1`,[r])).rows[0];const rows=(await c.query(`SELECT e.id,e.kind,e.amount_minor::text AS "amountMinor",e.label,e.created_at AS "createdAt",e.reversal_of AS "reversalOf",e.source_type AS "sourceType",e.business_date::text AS "businessDate",EXISTS(SELECT 1 FROM folio_entries rev WHERE rev.reversal_of=e.id) reversed FROM folio_entries e WHERE e.folio_id=$1 AND ($2::uuid IS NULL OR e.id>$2) ORDER BY e.id LIMIT 51`,[folio.id,after])).rows;return {folio,items:rows.slice(0,50),nextCursor:rows.length>50?nextCursor(bound,rows[49].id):null,accountingMode:mode};});}
 async charge(a:RequestActorContext,target:unknown,key:unknown,raw:unknown){enabled();const r=id(target),command=id(key),input=chargeInput(raw),payload={type:'charge',reservationId:r,...input};return this.db.withActor(a,async c=>{
  const initial=await booking(c,a,r),prior=await replay<Receipt>(c,a,initial.property_id,command,payload);if(prior)return prior;
  const stay=await booking(c,a,r,true),folio=await openFolio(c,a,stay),entry=entryId();
  await c.query(`INSERT INTO folio_entries(id,organization_id,property_id,folio_id,currency,kind,amount_minor,label,source_type,source_id,idempotency_key) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'manual_charge',$1,'folio:'||$9)`,[entry,a.organizationId,stay.property_id,folio,stay.currency,input.kind,input.amountMinor,{ru:input.label,uz:input.label,en:input.label},command]);
  const result={entryId:entry,folioId:folio,reservationId:r,idempotentReplay:false};await record(c,a,stay.property_id,command,payload,result,'folio.charge_added',folio);return result;
 });}
 async reverse(a:RequestActorContext,target:unknown,key:unknown,raw:unknown){enabled();const r=id(target),command=id(key),input=reversalInput(raw),payload={type:'reverse',reservationId:r,...input};return this.db.withActor(a,async c=>{
  const initial=await booking(c,a,r),prior=await replay<Receipt>(c,a,initial.property_id,command,payload);if(prior)return prior;
  const stay=await booking(c,a,r,true),folio=await openFolio(c,a,stay),source=(await c.query<{id:string;amount_minor:string;kind:string;source_type:string;ledger_journal_id:string|null}>('SELECT id,amount_minor::text,kind,source_type,ledger_journal_id FROM folio_entries WHERE id=$1 AND folio_id=$2',[input.entryId,folio])).rows[0];
  if(!source||source.kind==='reversal'||!['manual_charge','night_audit'].includes(source.source_type)||source.ledger_journal_id)throw new ConflictException('FOLIO_REVERSAL_NOT_ALLOWED');
  if((await c.query('SELECT 1 FROM folio_entries WHERE reversal_of=$1',[source.id])).rowCount)throw new ConflictException('FOLIO_ALREADY_REVERSED');
  const entry=entryId();await c.query(`INSERT INTO folio_entries(id,organization_id,property_id,folio_id,currency,kind,amount_minor,label,source_type,source_id,idempotency_key,reversal_of,policy_snapshot) VALUES($1,$2,$3,$4,$5,'reversal',$6,$7,'manual_reversal',$1,'folio:'||$8,$9,$10)`,[entry,a.organizationId,stay.property_id,folio,stay.currency,(-BigInt(source.amount_minor)).toString(),{ru:input.reason,uz:input.reason,en:input.reason},command,source.id,{reason:input.reason}]);
  const result={entryId:entry,folioId:folio,reservationId:r,idempotentReplay:false};await record(c,a,stay.property_id,command,payload,result,'folio.charge_reversed',folio);return result;
 });}
}
