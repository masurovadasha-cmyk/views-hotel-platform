import {createHash} from "node:crypto";
import {Injectable} from "@nestjs/common";
import type {PoolClient} from "pg";
import {DatabaseService} from "../database/database.service";
import type {RequestActorContext} from "../identity/actor-context";
import {LedgerService} from "../payments/ledger.service";

export type EconomicsSourceKind="manual"|"contract"|"provider";

type AllocationInput={
  platformCommissionMinor:string;
  ownerPayableMinor:string;
  taxesWithheldMinor?:string;
  otherDeductionsMinor?:string;
  sourceKind:EconomicsSourceKind;
  sourceReference?:string;
};

const transientPaymentStatuses=new Set([
  "requires_payment","pending_provider","authorized","partially_captured","refund_pending"
]);

@Injectable()
export class MarketplaceEconomicsService{
  constructor(
    private readonly db:DatabaseService,
    private readonly ledger:LedgerService
  ){}

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
    if(input.sourceReference!==undefined&&input.sourceReference.trim().length>200){
      throw new Error("INVALID_ECONOMICS_SOURCE_REFERENCE");
    }

    const platformCommission=this.minor(input.platformCommissionMinor,"PLATFORM_COMMISSION");
    const ownerPayable=this.minor(input.ownerPayableMinor,"OWNER_PAYABLE");
    const taxesWithheld=this.minor(input.taxesWithheldMinor??"0","TAXES_WITHHELD");
    const otherDeductions=this.minor(input.otherDeductionsMinor??"0","OTHER_DEDUCTIONS");

    return this.db.withActor(actor,async client=>{
      await this.assertRole(client,["owner","manager","accountant"]);

      const reservation=(await client.query<{
        property_id:string;currency:string;status:string;
      }>(
        "SELECT property_id,currency,status FROM reservations WHERE id=$1 AND organization_id=$2 FOR UPDATE",
        [reservationId,actor.organizationId]
      )).rows[0];
      if(!reservation)throw new Error("RESERVATION_NOT_FOUND");
      if(!["confirmed","checked_in","checked_out","cancelled","no_show"].includes(reservation.status)){
        throw new Error("ECONOMICS_RESERVATION_NOT_SETTLEABLE");
      }

      const access=(await client.query<{allowed:boolean}>(
        "SELECT app.can_access_property($1::uuid) AS allowed",[reservation.property_id]
      )).rows[0]?.allowed;
      if(!access)throw new Error("PROPERTY_FORBIDDEN");

      const money=await this.currentPaymentState(
        client,actor.organizationId,reservationId,reservation.currency
      );
      const allocated=platformCommission+ownerPayable+taxesWithheld+otherDeductions;
      if(allocated!==money.netCollected)throw new Error("ECONOMICS_ALLOCATION_MISMATCH");

      const normalized={
        reservationId,
        platformCommissionMinor:platformCommission.toString(),
        ownerPayableMinor:ownerPayable.toString(),
        taxesWithheldMinor:taxesWithheld.toString(),
        otherDeductionsMinor:otherDeductions.toString(),
        sourceKind:input.sourceKind,
        sourceReference:input.sourceReference?.trim()||null,
        paymentStateHash:money.hash
      };
      const requestHash=this.hash(normalized);

      const existing=(await client.query<{
        id:string;request_hash:string;status:string;version:number;
        net_collected_minor:string;currency:string;payment_state_hash:string;
      }>(
        `SELECT id,request_hash,status,version,net_collected_minor::text,currency,payment_state_hash
           FROM reservation_economic_snapshots
          WHERE organization_id=$1 AND idempotency_key=$2`,
        [actor.organizationId,key]
      )).rows[0];
      if(existing){
        if(existing.request_hash!==requestHash)throw new Error("IDEMPOTENCY_CONFLICT");
        return {
          snapshotId:existing.id,status:existing.status,version:existing.version,
          netCollectedMinor:existing.net_collected_minor,currency:existing.currency,
          paymentStateHash:existing.payment_state_hash,idempotentReplay:true
        };
      }

      const version=Number((await client.query<{version:number}>(
        "SELECT COALESCE(MAX(version),0)+1 AS version FROM reservation_economic_snapshots WHERE reservation_id=$1",
        [reservationId]
      )).rows[0].version);

      const row=(await client.query<{id:string;created_at:Date}>(
        `INSERT INTO reservation_economic_snapshots(
           id,organization_id,property_id,reservation_id,version,currency,
           net_collected_minor,platform_commission_minor,owner_payable_minor,
           taxes_withheld_minor,other_deductions_minor,status,source_kind,source_reference,
           idempotency_key,request_hash,payment_state_hash,
           created_by_user_id,created_by_membership_id
         ) VALUES(
           gen_random_uuid(),$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
           'draft',$11,$12,$13,$14,$15,$16,$17
         )
         RETURNING id,created_at`,
        [
          actor.organizationId,reservation.property_id,reservationId,version,reservation.currency,
          money.netCollected.toString(),platformCommission.toString(),ownerPayable.toString(),
          taxesWithheld.toString(),otherDeductions.toString(),input.sourceKind,
          input.sourceReference?.trim()||null,key,requestHash,money.hash,
          actor.userId,actor.membershipId
        ]
      )).rows[0];

      await client.query(
        `INSERT INTO audit_log(
           id,organization_id,actor_user_id,actor_membership_id,request_id,
           action,entity_type,entity_id,after_state
         ) VALUES(
           gen_random_uuid(),$1,$2,$3,$4,
           'marketplace.economics_draft_created','reservation_economic_snapshot',$5,$6::jsonb
         )`,
        [
          actor.organizationId,actor.userId,actor.membershipId,actor.requestId,row.id,
          JSON.stringify({
            ...normalized,version,netCollectedMinor:money.netCollected.toString(),
            currency:reservation.currency
          })
        ]
      );

      return {
        snapshotId:row.id,status:"draft" as const,version,
        netCollectedMinor:money.netCollected.toString(),currency:reservation.currency,
        paymentStateHash:money.hash,createdAt:row.created_at.toISOString(),
        idempotentReplay:false
      };
    });
  }

  async finalize(actor:RequestActorContext,snapshotId:string){
    return this.db.withActor(actor,async client=>{
      await this.assertRole(client,["owner","accountant"]);

      const snapshot=(await client.query<{
        id:string;organization_id:string;property_id:string;reservation_id:string;version:number;
        currency:string;net_collected_minor:string;platform_commission_minor:string;
        owner_payable_minor:string;taxes_withheld_minor:string;other_deductions_minor:string;
        status:string;source_kind:string;source_reference:string|null;finalized_at:Date|null;
        payment_state_hash:string;ledger_journal_id:string|null;reservation_status:string;
      }>(
        `SELECT
           s.id,s.organization_id,s.property_id,s.reservation_id,s.version,s.currency,
           s.net_collected_minor::text,s.platform_commission_minor::text,
           s.owner_payable_minor::text,s.taxes_withheld_minor::text,
           s.other_deductions_minor::text,s.status,s.source_kind,s.source_reference,
           s.finalized_at,s.payment_state_hash,s.ledger_journal_id,
           r.status AS reservation_status
         FROM reservation_economic_snapshots s
         JOIN reservations r
           ON r.id=s.reservation_id
          AND r.organization_id=s.organization_id
        WHERE s.id=$1
        FOR UPDATE OF s,r`,
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
          finalizedAt:snapshot.finalized_at?.toISOString()??null,
          ledgerJournalId:snapshot.ledger_journal_id,idempotentReplay:true
        };
      }
      if(snapshot.status!=="draft")throw new Error("ECONOMICS_SNAPSHOT_NOT_DRAFT");
      if(!["checked_out","cancelled","no_show"].includes(snapshot.reservation_status)){
        throw new Error("ECONOMICS_FINALIZE_TOO_EARLY");
      }

      const money=await this.currentPaymentState(
        client,actor.organizationId,snapshot.reservation_id,snapshot.currency
      );
      if(
        money.netCollected!==BigInt(snapshot.net_collected_minor)||
        money.hash!==snapshot.payment_state_hash
      ){
        throw new Error("ECONOMICS_PAYMENT_STATE_CHANGED");
      }

      const guestDepositBalance=await this.reservationGuestDepositBalance(
        client,actor.organizationId,snapshot.reservation_id,snapshot.currency
      );
      if(guestDepositBalance!==money.netCollected){
        throw new Error("ECONOMICS_LEDGER_PAYMENT_MISMATCH");
      }

      const other=(await client.query<{id:string}>(
        "SELECT id FROM reservation_economic_snapshots WHERE reservation_id=$1 AND status='finalized' AND id<>$2 LIMIT 1",
        [snapshot.reservation_id,snapshot.id]
      )).rows[0];
      if(other)throw new Error("ECONOMICS_ALREADY_FINALIZED");

      const ledgerJournalId=await this.ledger.postMarketplaceEconomics(client,{
        organizationId:actor.organizationId,
        snapshotId:snapshot.id,
        reservationId:snapshot.reservation_id,
        currency:snapshot.currency,
        netCollectedMinor:BigInt(snapshot.net_collected_minor),
        platformCommissionMinor:BigInt(snapshot.platform_commission_minor),
        ownerPayableMinor:BigInt(snapshot.owner_payable_minor),
        taxesWithheldMinor:BigInt(snapshot.taxes_withheld_minor),
        otherDeductionsMinor:BigInt(snapshot.other_deductions_minor),
        idempotencyKey:"marketplace-economics:"+snapshot.id+":finalized"
      });

      const finalized=(await client.query<{finalized_at:Date}>(
        `UPDATE reservation_economic_snapshots
            SET status='finalized',
                finalized_by_user_id=$2,
                finalized_by_membership_id=$3,
                finalized_at=now(),
                ledger_journal_id=$4,
                updated_at=now()
          WHERE id=$1 AND status='draft'
          RETURNING finalized_at`,
        [snapshot.id,actor.userId,actor.membershipId,ledgerJournalId]
      )).rows[0];
      if(!finalized)throw new Error("ECONOMICS_FINALIZE_CONFLICT");

      const payload={
        schemaVersion:1,
        economicsSnapshotId:snapshot.id,
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
        ledgerJournalId,
        finalizedAt:finalized.finalized_at.toISOString()
      };

      await client.query(
        `INSERT INTO outbox_events(
           id,organization_id,aggregate_type,aggregate_id,event_type,idempotency_key,payload
         ) VALUES(
           gen_random_uuid(),$1,'reservation',$2,'marketplace.reservation_economics.v1',$3,$4::jsonb
         )
         ON CONFLICT(idempotency_key) DO NOTHING`,
        [
          actor.organizationId,snapshot.reservation_id,
          "marketplace:economics:"+snapshot.id+":finalized",JSON.stringify(payload)
        ]
      );

      await client.query(
        `INSERT INTO audit_log(
           id,organization_id,actor_user_id,actor_membership_id,request_id,
           action,entity_type,entity_id,after_state
         ) VALUES(
           gen_random_uuid(),$1,$2,$3,$4,
           'marketplace.economics_finalized','reservation_economic_snapshot',$5,$6::jsonb
         )`,
        [actor.organizationId,actor.userId,actor.membershipId,actor.requestId,snapshot.id,JSON.stringify(payload)]
      );

      return {
        snapshotId:snapshot.id,status:"finalized" as const,version:snapshot.version,
        finalizedAt:finalized.finalized_at.toISOString(),
        ledgerJournalId,idempotentReplay:false
      };
    });
  }

  async reservationSnapshots(actor:RequestActorContext,reservationId:string){
    return this.db.withActor(actor,async client=>{
      await this.assertRole(client,["host","owner","manager","accountant"]);

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
        finalized_at:Date|null;created_at:Date;ledger_journal_id:string|null;
        reconciliation_status:string|null;net_drift_minor:string|null;
      }>(
        `SELECT
           s.id,s.version,s.currency,s.net_collected_minor::text,
           s.platform_commission_minor::text,s.owner_payable_minor::text,
           s.taxes_withheld_minor::text,s.other_deductions_minor::text,
           s.status,s.source_kind,s.source_reference,s.finalized_at,s.created_at,s.ledger_journal_id,
           r.reconciliation_status,r.net_drift_minor::text
         FROM reservation_economic_snapshots s
         LEFT JOIN reservation_economic_reconciliation r
           ON r.economics_snapshot_id=s.id
        WHERE s.reservation_id=$1
        ORDER BY s.version DESC`,
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
        ledgerJournalId:row.ledger_journal_id,
        reconciliationStatus:row.reconciliation_status,
        netDriftMinor:row.net_drift_minor,
        finalizedAt:row.finalized_at?.toISOString()??null,
        createdAt:row.created_at.toISOString()
      }));
    });
  }

  private async reservationGuestDepositBalance(
    client:PoolClient,
    organizationId:string,
    reservationId:string,
    currency:string
  ){
    const row=(await client.query<{balance:string}>(
      `SELECT COALESCE(SUM(
          CASE
            WHEN e.side='credit' THEN e.amount_minor
            ELSE -e.amount_minor
          END
        ),0)::text AS balance
       FROM ledger_entries e
       JOIN ledger_accounts a
         ON a.id=e.account_id
        AND a.code='guest_deposits'
        AND a.currency=$3
       JOIN ledger_journals j
         ON j.id=e.journal_id
        AND j.organization_id=$1
        AND j.reference_type='payment_intent'
        AND j.status='posted'
       JOIN payment_intents pi
         ON pi.id=j.reference_id
        AND pi.organization_id=$1
        AND pi.reservation_id=$2`,
      [organizationId,reservationId,currency]
    )).rows[0];
    return BigInt(row?.balance??"0");
  }

  private async currentPaymentState(
    client:PoolClient,
    organizationId:string,
    reservationId:string,
    currency:string
  ){
    const rows=(await client.query<{
      id:string;status:string;currency:string;captured_minor:string;refunded_minor:string;
      version:number;updated_at:Date;
    }>(
      `SELECT
         id,status,currency,captured_minor::text,refunded_minor::text,version,updated_at
       FROM payment_intents
      WHERE organization_id=$1 AND reservation_id=$2
      ORDER BY id`,
      [organizationId,reservationId]
    )).rows;

    if(rows.some(row=>row.currency!==currency)){
      throw new Error("ECONOMICS_PAYMENT_CURRENCY_MISMATCH");
    }
    if(rows.some(row=>transientPaymentStatuses.has(row.status))){
      throw new Error("ECONOMICS_PAYMENT_STATE_NOT_SETTLED");
    }

    let captured=0n,refunded=0n;
    for(const row of rows){
      captured+=BigInt(row.captured_minor);
      refunded+=BigInt(row.refunded_minor);
    }
    if(refunded>captured)throw new Error("ECONOMICS_PAYMENT_STATE_INVALID");

    const canonical=rows.map(row=>({
      id:row.id,status:row.status,currency:row.currency,
      capturedMinor:row.captured_minor,refundedMinor:row.refunded_minor,
      version:row.version,updatedAt:row.updated_at.toISOString()
    }));
    return {captured,refunded,netCollected:captured-refunded,hash:this.hash(canonical)};
  }

  private minor(value:string,name:string){
    if(typeof value!=="string"||!/^\d+$/.test(value)){
      throw new Error("INVALID_"+name+"_MINOR");
    }
    return BigInt(value);
  }

  private async assertRole(client:PoolClient,allowed:string[]){
    const role=(await client.query<{code:string|null}>(
      "SELECT app.current_membership_role() AS code"
    )).rows[0]?.code;
    if(!role||!allowed.includes(role))throw new Error("ECONOMICS_ROLE_FORBIDDEN");
  }

  private hash(value:unknown){
    return createHash("sha256").update(JSON.stringify(value)).digest("hex");
  }
}
