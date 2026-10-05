import {createHash} from "node:crypto";
import {Injectable} from "@nestjs/common";
import {DatabaseService} from "../database/database.service";
import type {RequestActorContext} from "../identity/actor-context";

export type EconomicsSourceKind="manual"|"contract"|"provider";

type AllocationInput={
  platformCommissionMinor:string;
  ownerPayableMinor:string;
  taxesWithheldMinor?:string;
  otherDeductionsMinor?:string;
  sourceKind:EconomicsSourceKind;
  sourceReference?:string;
};

@Injectable()
export class MarketplaceEconomicsService{
  constructor(private readonly db:DatabaseService){}

  async createDraft(
    actor:RequestActorContext,
    reservationId:string,
    idempotencyKey:string,
    input:AllocationInput
  ){
    const key=idempotencyKey.trim();
    if(!key||key.length>160)throw new Error("INVALID_IDEMPOTENCY_KEY");
    if(!["manual","contract","provider"].includes(input.sourceKind)){
      throw new Error("INVALID_ECONOMICS_SOURCE_KIND");
    }
    if(input.sourceReference!==undefined&&input.sourceReference.length>200){
      throw new Error("INVALID_ECONOMICS_SOURCE_REFERENCE");
    }

    const platformCommission=this.minor(input.platformCommissionMinor,"PLATFORM_COMMISSION");
    const ownerPayable=this.minor(input.ownerPayableMinor,"OWNER_PAYABLE");
    const taxesWithheld=this.minor(input.taxesWithheldMinor??"0","TAXES_WITHHELD");
    const otherDeductions=this.minor(input.otherDeductionsMinor??"0","OTHER_DEDUCTIONS");
    const normalized={
      reservationId,
      platformCommissionMinor:platformCommission.toString(),
      ownerPayableMinor:ownerPayable.toString(),
      taxesWithheldMinor:taxesWithheld.toString(),
      otherDeductionsMinor:otherDeductions.toString(),
      sourceKind:input.sourceKind,
      sourceReference:input.sourceReference?.trim()||null
    };
    const requestHash=createHash("sha256").update(JSON.stringify(normalized)).digest("hex");

    return this.db.withActor(actor,async client=>{
      await this.assertWriteRole(client);

      const existing=(await client.query<{
        id:string;request_hash:string;status:string;version:number;
        net_collected_minor:string;currency:string;
      }>(
        "SELECT id,request_hash,status,version,net_collected_minor::text,currency FROM reservation_economic_snapshots WHERE organization_id=$1 AND idempotency_key=$2",
        [actor.organizationId,key]
      )).rows[0];
      if(existing){
        if(existing.request_hash!==requestHash)throw new Error("IDEMPOTENCY_CONFLICT");
        return {
          snapshotId:existing.id,status:existing.status,version:existing.version,
          netCollectedMinor:existing.net_collected_minor,currency:existing.currency,
          idempotentReplay:true
        };
      }

      const reservation=(await client.query<{
        property_id:string;currency:string;status:string;
      }>(
        "SELECT property_id,currency,status FROM reservations WHERE id=$1 AND organization_id=$2 FOR UPDATE",
        [reservationId,actor.organizationId]
      )).rows[0];
      if(!reservation)throw new Error("RESERVATION_NOT_FOUND");
      if(["hold","pending"].includes(reservation.status)){
        throw new Error("ECONOMICS_RESERVATION_NOT_SETTLEABLE");
      }

      const access=(await client.query<{allowed:boolean}>(
        "SELECT app.can_access_property($1::uuid) AS allowed",[reservation.property_id]
      )).rows[0]?.allowed;
      if(!access)throw new Error("PROPERTY_FORBIDDEN");

      const money=await this.currentNetCollected(
        client,actor.organizationId,reservationId,reservation.currency
      );
      const allocated=platformCommission+ownerPayable+taxesWithheld+otherDeductions;
      if(allocated!==money.netCollected)throw new Error("ECONOMICS_ALLOCATION_MISMATCH");

      const versionRow=(await client.query<{version:number}>(
        "SELECT COALESCE(MAX(version),0)+1 AS version FROM reservation_economic_snapshots WHERE reservation_id=$1",
        [reservationId]
      )).rows[0];
      const version=Number(versionRow.version);

      const row=(await client.query<{id:string;created_at:Date}>(
        "INSERT INTO reservation_economic_snapshots(id,organization_id,property_id,reservation_id,version,currency,net_collected_minor,platform_commission_minor,owner_payable_minor,taxes_withheld_minor,other_deductions_minor,status,source_kind,source_reference,idempotency_key,request_hash,created_by_user_id,created_by_membership_id) VALUES(gen_random_uuid(),$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,\'draft\',$11,$12,$13,$14,$15,$16) RETURNING id,created_at",
        [
          actor.organizationId,reservation.property_id,reservationId,version,reservation.currency,
          money.netCollected.toString(),platformCommission.toString(),ownerPayable.toString(),
          taxesWithheld.toString(),otherDeductions.toString(),input.sourceKind,
          input.sourceReference?.trim()||null,key,requestHash,actor.userId,actor.membershipId
        ]
      )).rows[0];

      await client.query(
        "INSERT INTO audit_log(id,organization_id,actor_user_id,actor_membership_id,request_id,action,entity_type,entity_id,after_state) VALUES(gen_random_uuid(),$1,$2,$3,$4,\'marketplace.economics_draft_created\',\'reservation_economic_snapshot\',$5,$6::jsonb)",
        [
          actor.organizationId,actor.userId,actor.membershipId,actor.requestId,row.id,
          JSON.stringify({...normalized,version,netCollectedMinor:money.netCollected.toString(),currency:reservation.currency})
        ]
      );

      return {
        snapshotId:row.id,status:"draft" as const,version,
        netCollectedMinor:money.netCollected.toString(),currency:reservation.currency,
        createdAt:row.created_at.toISOString(),idempotentReplay:false
      };
    });
  }

  async finalize(actor:RequestActorContext,snapshotId:string){
    return this.db.withActor(actor,async client=>{
      await this.assertWriteRole(client);

      const snapshot=(await client.query<{
        id:string;organization_id:string;property_id:string;reservation_id:string;version:number;
        currency:string;net_collected_minor:string;platform_commission_minor:string;
        owner_payable_minor:string;taxes_withheld_minor:string;other_deductions_minor:string;
        status:string;source_kind:string;source_reference:string|null;finalized_at:Date|null;
      }>(
        "SELECT id,organization_id,property_id,reservation_id,version,currency,net_collected_minor::text,platform_commission_minor::text,owner_payable_minor::text,taxes_withheld_minor::text,other_deductions_minor::text,status,source_kind,source_reference,finalized_at FROM reservation_economic_snapshots WHERE id=$1 FOR UPDATE",
        [snapshotId]
      )).rows[0];
      if(!snapshot)throw new Error("ECONOMICS_SNAPSHOT_NOT_FOUND");

      const access=(await client.query<{allowed:boolean}>(
        "SELECT app.can_access_property($1::uuid) AS allowed",[snapshot.property_id]
      )).rows[0]?.allowed;
      if(!access)throw new Error("PROPERTY_FORBIDDEN");

      if(snapshot.status==="finalized"){
        return {
          snapshotId:snapshot.id,status:"finalized" as const,version:snapshot.version,
          finalizedAt:snapshot.finalized_at?.toISOString()??null,idempotentReplay:true
        };
      }

      const reservation=(await client.query<{status:string;currency:string}>(
        "SELECT status,currency FROM reservations WHERE id=$1",[snapshot.reservation_id]
      )).rows[0];
      if(!reservation)throw new Error("RESERVATION_NOT_FOUND");
      if(["hold","pending"].includes(reservation.status)){
        throw new Error("ECONOMICS_RESERVATION_NOT_SETTLEABLE");
      }

      const money=await this.currentNetCollected(
        client,actor.organizationId,snapshot.reservation_id,snapshot.currency
      );
      if(money.netCollected!==BigInt(snapshot.net_collected_minor)){
        throw new Error("ECONOMICS_NET_COLLECTED_CHANGED");
      }

      const other=(await client.query<{id:string}>(
        "SELECT id FROM reservation_economic_snapshots WHERE reservation_id=$1 AND status=\'finalized\' AND id<>$2 LIMIT 1",
        [snapshot.reservation_id,snapshot.id]
      )).rows[0];
      if(other)throw new Error("ECONOMICS_ALREADY_FINALIZED");

      const finalized=(await client.query<{finalized_at:Date}>(
        "UPDATE reservation_economic_snapshots SET status=\'finalized\',finalized_by_user_id=$2,finalized_by_membership_id=$3,finalized_at=now(),updated_at=now() WHERE id=$1 AND status=\'draft\' RETURNING finalized_at",
        [snapshot.id,actor.userId,actor.membershipId]
      )).rows[0];
      if(!finalized)throw new Error("ECONOMICS_FINALIZE_CONFLICT");

      const payload={
        schemaVersion:1,
        snapshotId:snapshot.id,
        reservationId:snapshot.reservation_id,
        propertyId:snapshot.property_id,
        version:snapshot.version,
        currency:snapshot.currency,
        netCollectedMinor:snapshot.net_collected_minor,
        platformCommissionMinor:snapshot.platform_commission_minor,
        ownerPayableMinor:snapshot.owner_payable_minor,
        taxesWithheldMinor:snapshot.taxes_withheld_minor,
        otherDeductionsMinor:snapshot.other_deductions_minor,
        sourceKind:snapshot.source_kind,
        sourceReference:snapshot.source_reference,
        finalizedAt:finalized.finalized_at.toISOString()
      };

      await client.query(
        "INSERT INTO outbox_events(id,organization_id,aggregate_type,aggregate_id,event_type,idempotency_key,payload) VALUES(gen_random_uuid(),$1,\'reservation_economics\',$2,\'marketplace.reservation_economics.v1\',$3,$4::jsonb) ON CONFLICT(idempotency_key) DO NOTHING",
        [
          actor.organizationId,snapshot.id,
          "marketplace:economics:"+snapshot.id+":finalized",JSON.stringify(payload)
        ]
      );

      await client.query(
        "INSERT INTO audit_log(id,organization_id,actor_user_id,actor_membership_id,request_id,action,entity_type,entity_id,after_state) VALUES(gen_random_uuid(),$1,$2,$3,$4,\'marketplace.economics_finalized\',\'reservation_economic_snapshot\',$5,$6::jsonb)",
        [actor.organizationId,actor.userId,actor.membershipId,actor.requestId,snapshot.id,JSON.stringify(payload)]
      );

      return {
        snapshotId:snapshot.id,status:"finalized" as const,version:snapshot.version,
        finalizedAt:finalized.finalized_at.toISOString(),idempotentReplay:false
      };
    });
  }

  async reservationSnapshots(actor:RequestActorContext,reservationId:string){
    return this.db.withActor(actor,async client=>{
      await this.assertReadRole(client);
      const reservation=(await client.query<{property_id:string}>(
        "SELECT property_id FROM reservations WHERE id=$1 AND organization_id=$2",
        [reservationId,actor.organizationId]
      )).rows[0];
      if(!reservation)throw new Error("RESERVATION_NOT_FOUND");
      const access=(await client.query<{allowed:boolean}>(
        "SELECT app.can_access_property($1::uuid) AS allowed",[reservation.property_id]
      )).rows[0]?.allowed;
      if(!access)throw new Error("PROPERTY_FORBIDDEN");

      const rows=await client.query<{
        id:string;version:number;currency:string;net_collected_minor:string;
        platform_commission_minor:string;owner_payable_minor:string;taxes_withheld_minor:string;
        other_deductions_minor:string;status:string;source_kind:string;source_reference:string|null;
        finalized_at:Date|null;created_at:Date;
      }>(
        "SELECT id,version,currency,net_collected_minor::text,platform_commission_minor::text,owner_payable_minor::text,taxes_withheld_minor::text,other_deductions_minor::text,status,source_kind,source_reference,finalized_at,created_at FROM reservation_economic_snapshots WHERE reservation_id=$1 ORDER BY version DESC",
        [reservationId]
      );
      return rows.rows.map(row=>({
        snapshotId:row.id,version:row.version,currency:row.currency,
        netCollectedMinor:row.net_collected_minor,
        platformCommissionMinor:row.platform_commission_minor,
        ownerPayableMinor:row.owner_payable_minor,
        taxesWithheldMinor:row.taxes_withheld_minor,
        otherDeductionsMinor:row.other_deductions_minor,
        status:row.status,sourceKind:row.source_kind,sourceReference:row.source_reference,
        finalizedAt:row.finalized_at?.toISOString()??null,createdAt:row.created_at.toISOString()
      }));
    });
  }

  private async currentNetCollected(
    client:import("pg").PoolClient,
    organizationId:string,
    reservationId:string,
    currency:string
  ){
    const row=(await client.query<{
      captured_minor:string;refunded_minor:string;currency_count:string;
    }>(
      "SELECT COALESCE(SUM(captured_minor),0)::text AS captured_minor,COALESCE(SUM(refunded_minor),0)::text AS refunded_minor,COUNT(DISTINCT currency)::text AS currency_count FROM payment_intents WHERE organization_id=$1 AND reservation_id=$2",
      [organizationId,reservationId]
    )).rows[0];

    const count=Number(row.currency_count);
    if(count>1)throw new Error("ECONOMICS_PAYMENT_CURRENCY_MISMATCH");
    if(count===1){
      const actual=(await client.query<{currency:string}>(
        "SELECT currency FROM payment_intents WHERE organization_id=$1 AND reservation_id=$2 LIMIT 1",
        [organizationId,reservationId]
      )).rows[0]?.currency;
      if(actual!==currency)throw new Error("ECONOMICS_PAYMENT_CURRENCY_MISMATCH");
    }

    const captured=BigInt(row.captured_minor);
    const refunded=BigInt(row.refunded_minor);
    return {captured,refunded,netCollected:captured-refunded};
  }

  private minor(value:string,name:string){
    if(typeof value!=="string"||!/^\d+$/.test(value)){
      throw new Error("INVALID_"+name+"_MINOR");
    }
    return BigInt(value);
  }

  private async assertWriteRole(client:import("pg").PoolClient){
    const role=(await client.query<{code:string|null}>(
      "SELECT app.current_membership_role() AS code"
    )).rows[0]?.code;
    if(!role||!["owner","manager","accountant"].includes(role)){
      throw new Error("ECONOMICS_ROLE_FORBIDDEN");
    }
  }

  private async assertReadRole(client:import("pg").PoolClient){
    const role=(await client.query<{code:string|null}>(
      "SELECT app.current_membership_role() AS code"
    )).rows[0]?.code;
    if(!role||!["host","owner","manager","accountant"].includes(role)){
      throw new Error("ECONOMICS_ROLE_FORBIDDEN");
    }
  }
}