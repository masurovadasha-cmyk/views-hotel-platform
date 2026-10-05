import {createHash} from "node:crypto";
import {Injectable} from "@nestjs/common";
import type {PoolClient} from "pg";
import {DatabaseService} from "../database/database.service";
import type {RequestActorContext} from "../identity/actor-context";
import {LedgerService} from "./ledger.service";

type EconomicsSourceKind="manual"|"contract"|"provider";

export type CreateEconomicsDraftInput={
  actor:RequestActorContext;
  reservationId:string;
  idempotencyKey:string;
  sourceKind:EconomicsSourceKind;
  sourceReference?:string;
  platformCommissionMinor:bigint;
  ownerPayableMinor:bigint;
  taxesWithheldMinor:bigint;
  otherDeductionsMinor:bigint;
};

const transientPaymentStatuses=new Set([
  "requires_payment",
  "pending_provider",
  "authorized",
  "partially_captured",
  "refund_pending"
]);

@Injectable()
export class MarketplaceEconomicsService{
  constructor(
    private readonly db:DatabaseService,
    private readonly ledger:LedgerService
  ){}

  async createDraft(input:CreateEconomicsDraftInput){
    this.validateInput(input);

    return this.db.withActor(input.actor,async client=>{
      await this.assertRole(client,["owner","manager","accountant"]);

      const reservation=(await client.query<{
        property_id:string;currency:string;status:string;
      }>(
        `SELECT property_id,currency,status
           FROM reservations
          WHERE id=$1
          FOR UPDATE`,
        [input.reservationId]
      )).rows[0];
      if(!reservation)throw new Error("RESERVATION_NOT_FOUND");

      const access=(await client.query<{allowed:boolean}>(
        "SELECT app.can_access_property($1::uuid) AS allowed",
        [reservation.property_id]
      )).rows[0]?.allowed;
      if(!access)throw new Error("PROPERTY_FORBIDDEN");

      if(!["confirmed","checked_in","checked_out","cancelled","no_show"].includes(reservation.status)){
        throw new Error("ECONOMICS_RESERVATION_NOT_ELIGIBLE");
      }

      const paymentState=await this.paymentState(
        client,input.actor.organizationId,input.reservationId,reservation.currency
      );
      const components=
        input.platformCommissionMinor+
        input.ownerPayableMinor+
        input.taxesWithheldMinor+
        input.otherDeductionsMinor;

      if(components!==paymentState.netCollectedMinor){
        throw new Error("ECONOMICS_NET_MISMATCH");
      }

      const requestHash=this.requestHash({
        reservationId:input.reservationId,
        sourceKind:input.sourceKind,
        sourceReference:input.sourceReference??null,
        platformCommissionMinor:input.platformCommissionMinor.toString(),
        ownerPayableMinor:input.ownerPayableMinor.toString(),
        taxesWithheldMinor:input.taxesWithheldMinor.toString(),
        otherDeductionsMinor:input.otherDeductionsMinor.toString(),
        paymentStateHash:paymentState.hash
      });

      const existing=(await client.query<{
        id:string;request_hash:string;version:number;status:string;currency:string;
        net_collected_minor:string;platform_commission_minor:string;owner_payable_minor:string;
        taxes_withheld_minor:string;other_deductions_minor:string;payment_state_hash:string;
      }>(
        `SELECT
           id,request_hash,version,status,currency,
           net_collected_minor::text,platform_commission_minor::text,owner_payable_minor::text,
           taxes_withheld_minor::text,other_deductions_minor::text,payment_state_hash
         FROM reservation_economic_snapshots
        WHERE organization_id=$1 AND idempotency_key=$2`,
        [input.actor.organizationId,input.idempotencyKey]
      )).rows[0];

      if(existing){
        if(existing.request_hash!==requestHash){
          throw new Error("ECONOMICS_IDEMPOTENCY_CONFLICT");
        }
        return {
          snapshotId:existing.id,
          reservationId:input.reservationId,
          version:existing.version,
          status:existing.status,
          currency:existing.currency,
          netCollectedMinor:BigInt(existing.net_collected_minor),
          platformCommissionMinor:BigInt(existing.platform_commission_minor),
          ownerPayableMinor:BigInt(existing.owner_payable_minor),
          taxesWithheldMinor:BigInt(existing.taxes_withheld_minor),
          otherDeductionsMinor:BigInt(existing.other_deductions_minor),
          paymentStateHash:existing.payment_state_hash,
          idempotentReplay:true
        };
      }

      const version=(await client.query<{version:number}>(
        `SELECT COALESCE(MAX(version),0)+1 AS version
           FROM reservation_economic_snapshots
          WHERE reservation_id=$1`,
        [input.reservationId]
      )).rows[0].version;

      const row=(await client.query<{
        id:string;version:number;status:string;
      }>(
        `INSERT INTO reservation_economic_snapshots(
           id,organization_id,property_id,reservation_id,version,currency,
           net_collected_minor,platform_commission_minor,owner_payable_minor,
           taxes_withheld_minor,other_deductions_minor,status,source_kind,source_reference,
           idempotency_key,request_hash,payment_state_hash,
           created_by_user_id,created_by_membership_id
         ) VALUES(
           gen_random_uuid(),$1,$2,$3,$4,$5,
           $6,$7,$8,$9,$10,'draft',$11,$12,$13,$14,$15,$16,$17
         )
         RETURNING id,version,status`,
        [
          input.actor.organizationId,reservation.property_id,input.reservationId,version,
          reservation.currency,paymentState.netCollectedMinor.toString(),
          input.platformCommissionMinor.toString(),input.ownerPayableMinor.toString(),
          input.taxesWithheldMinor.toString(),input.otherDeductionsMinor.toString(),
          input.sourceKind,input.sourceReference?.trim()||null,input.idempotencyKey,
          requestHash,paymentState.hash,input.actor.userId,input.actor.membershipId
        ]
      )).rows[0];

      return {
        snapshotId:row.id,
        reservationId:input.reservationId,
        version:row.version,
        status:row.status,
        currency:reservation.currency,
        netCollectedMinor:paymentState.netCollectedMinor,
        platformCommissionMinor:input.platformCommissionMinor,
        ownerPayableMinor:input.ownerPayableMinor,
        taxesWithheldMinor:input.taxesWithheldMinor,
        otherDeductionsMinor:input.otherDeductionsMinor,
        paymentStateHash:paymentState.hash,
        idempotentReplay:false
      };
    });
  }

  async finalize(actor:RequestActorContext,snapshotId:string){
    return this.db.withActor(actor,async client=>{
      await this.assertRole(client,["owner","accountant"]);

      const snapshot=(await client.query<{
        id:string;organization_id:string;property_id:string;reservation_id:string;version:number;
        currency:string;status:string;payment_state_hash:string;net_collected_minor:string;
        platform_commission_minor:string;owner_payable_minor:string;taxes_withheld_minor:string;
        other_deductions_minor:string;ledger_journal_id:string|null;reservation_status:string;
      }>(
        `SELECT
           s.id,s.organization_id,s.property_id,s.reservation_id,s.version,s.currency,s.status,
           s.payment_state_hash,s.net_collected_minor::text,s.platform_commission_minor::text,
           s.owner_payable_minor::text,s.taxes_withheld_minor::text,s.other_deductions_minor::text,
           s.ledger_journal_id,r.status AS reservation_status
         FROM reservation_economic_snapshots s
         JOIN reservations r ON r.id=s.reservation_id
        WHERE s.id=$1
        FOR UPDATE OF s,r`,
        [snapshotId]
      )).rows[0];

      if(!snapshot)throw new Error("ECONOMICS_SNAPSHOT_NOT_FOUND");

      const access=(await client.query<{allowed:boolean}>(
        "SELECT app.can_access_property($1::uuid) AS allowed",
        [snapshot.property_id]
      )).rows[0]?.allowed;
      if(!access)throw new Error("PROPERTY_FORBIDDEN");

      if(snapshot.status==="finalized"){
        return {
          snapshotId:snapshot.id,
          reservationId:snapshot.reservation_id,
          status:"finalized" as const,
          ledgerJournalId:snapshot.ledger_journal_id,
          idempotentReplay:true
        };
      }
      if(snapshot.status!=="draft")throw new Error("ECONOMICS_SNAPSHOT_NOT_DRAFT");

      if(!["checked_out","cancelled","no_show"].includes(snapshot.reservation_status)){
        throw new Error("ECONOMICS_FINALIZE_TOO_EARLY");
      }

      const paymentState=await this.paymentState(
        client,actor.organizationId,snapshot.reservation_id,snapshot.currency
      );
      if(
        paymentState.hash!==snapshot.payment_state_hash||
        paymentState.netCollectedMinor!==BigInt(snapshot.net_collected_minor)
      ){
        throw new Error("ECONOMICS_PAYMENT_STATE_CHANGED");
      }

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

      await client.query(
        `INSERT INTO outbox_events(
           id,organization_id,aggregate_type,aggregate_id,event_type,idempotency_key,payload
         ) VALUES(
           gen_random_uuid(),$1,'reservation',$2,'marketplace.reservation_economics.v1',$3,$4::jsonb
         )
         ON CONFLICT(idempotency_key) DO NOTHING`,
        [
          actor.organizationId,snapshot.reservation_id,
          "marketplace:economics:"+snapshot.id+":finalized",
          JSON.stringify({
            schemaVersion:1,
            economicsSnapshotId:snapshot.id,
            reservationId:snapshot.reservation_id,
            propertyId:snapshot.property_id,
            currency:snapshot.currency,
            version:snapshot.version,
            netCollectedMinor:snapshot.net_collected_minor,
            platformCommissionMinor:snapshot.platform_commission_minor,
            ownerPayableMinor:snapshot.owner_payable_minor,
            taxesWithheldMinor:snapshot.taxes_withheld_minor,
            otherDeductionsMinor:snapshot.other_deductions_minor,
            finalizedAt:finalized.finalized_at.toISOString()
          })
        ]
      );

      return {
        snapshotId:snapshot.id,
        reservationId:snapshot.reservation_id,
        status:"finalized" as const,
        ledgerJournalId,
        finalizedAt:finalized.finalized_at.toISOString(),
        idempotentReplay:false
      };
    });
  }

  async listReservation(actor:RequestActorContext,reservationId:string){
    return this.db.withActor(actor,async client=>{
      await this.assertRole(client,["owner","manager","accountant"]);

      const reservation=(await client.query<{property_id:string}>(
        "SELECT property_id FROM reservations WHERE id=$1",
        [reservationId]
      )).rows[0];
      if(!reservation)throw new Error("RESERVATION_NOT_FOUND");

      const access=(await client.query<{allowed:boolean}>(
        "SELECT app.can_access_property($1::uuid) AS allowed",
        [reservation.property_id]
      )).rows[0]?.allowed;
      if(!access)throw new Error("PROPERTY_FORBIDDEN");

      const rows=await client.query<{
        id:string;version:number;currency:string;status:string;source_kind:string;
        source_reference:string|null;net_collected_minor:string;platform_commission_minor:string;
        owner_payable_minor:string;taxes_withheld_minor:string;other_deductions_minor:string;
        ledger_journal_id:string|null;created_at:Date;finalized_at:Date|null;
      }>(
        `SELECT
           id,version,currency,status,source_kind,source_reference,
           net_collected_minor::text,platform_commission_minor::text,owner_payable_minor::text,
           taxes_withheld_minor::text,other_deductions_minor::text,ledger_journal_id,
           created_at,finalized_at
         FROM reservation_economic_snapshots
        WHERE reservation_id=$1
        ORDER BY version DESC`,
        [reservationId]
      );

      return rows.rows.map(row=>({
        snapshotId:row.id,
        version:row.version,
        currency:row.currency,
        status:row.status,
        sourceKind:row.source_kind,
        sourceReference:row.source_reference,
        netCollectedMinor:row.net_collected_minor,
        platformCommissionMinor:row.platform_commission_minor,
        ownerPayableMinor:row.owner_payable_minor,
        taxesWithheldMinor:row.taxes_withheld_minor,
        otherDeductionsMinor:row.other_deductions_minor,
        ledgerJournalId:row.ledger_journal_id,
        createdAt:row.created_at.toISOString(),
        finalizedAt:row.finalized_at?.toISOString()??null
      }));
    });
  }

  private async paymentState(
    client:PoolClient,
    organizationId:string,
    reservationId:string,
    reservationCurrency:string
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

    if(rows.some(row=>row.currency!==reservationCurrency)){
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
      id:row.id,
      status:row.status,
      currency:row.currency,
      capturedMinor:row.captured_minor,
      refundedMinor:row.refunded_minor,
      version:row.version,
      updatedAt:row.updated_at.toISOString()
    }));

    return {
      netCollectedMinor:captured-refunded,
      hash:this.requestHash(canonical)
    };
  }

  private async assertRole(client:PoolClient,allowed:string[]){
    const role=(await client.query<{code:string|null}>(
      "SELECT app.current_membership_role() AS code"
    )).rows[0]?.code;
    if(!role||!allowed.includes(role))throw new Error("ECONOMICS_ROLE_FORBIDDEN");
  }

  private validateInput(input:CreateEconomicsDraftInput){
    if(!input.idempotencyKey.trim()||input.idempotencyKey.length>160){
      throw new Error("INVALID_IDEMPOTENCY_KEY");
    }
    if(!["manual","contract","provider"].includes(input.sourceKind)){
      throw new Error("INVALID_ECONOMICS_SOURCE");
    }
    if(input.sourceReference&&input.sourceReference.trim().length>200){
      throw new Error("INVALID_ECONOMICS_SOURCE_REFERENCE");
    }
    const values=[
      input.platformCommissionMinor,input.ownerPayableMinor,
      input.taxesWithheldMinor,input.otherDeductionsMinor
    ];
    if(values.some(value=>value<0n))throw new Error("INVALID_ECONOMICS_AMOUNT");
  }

  private requestHash(value:unknown){
    return createHash("sha256").update(JSON.stringify(value)).digest("hex");
  }
}
