import {createHash,randomUUID} from "node:crypto";
import {Injectable} from "@nestjs/common";
import type {PoolClient} from "pg";
import {DatabaseService} from "../database/database.service";
import type {RequestActorContext} from "../identity/actor-context";
import {LedgerService} from "../payments/ledger.service";
import {OwnerPayoutProviderRegistry} from "./owner-payout-provider.registry";

type ClaimedPayout={
  id:string;
  organization_id:string;
  property_id:string;
  reservation_id:string;
  economics_snapshot_id:string;
  provider:string;
  destination_ref:string;
  amount_minor:string;
  currency:string;
  status:string;
  idempotency_key:string;
  external_payout_id:string|null;
  attempt_count:number;
};

const MAX_ATTEMPTS=5;
const LEASE_SECONDS=120;

@Injectable()
export class OwnerPayoutService{
  constructor(
    private readonly db:DatabaseService,
    private readonly providers:OwnerPayoutProviderRegistry,
    private readonly ledger:LedgerService
  ){}

  connectedProviders(){return this.providers.connected()}

  async prepare(
    actor:RequestActorContext,
    economicsSnapshotId:string,
    provider:string,
    destinationRef:string,
    idempotencyKey:string
  ){
    const normalizedProvider=provider.trim().toLowerCase();
    const destination=destinationRef.trim();
    const key=idempotencyKey.trim();

    if(!/^[a-z0-9_-]{1,80}$/.test(normalizedProvider))throw new Error("INVALID_PAYOUT_PROVIDER");
    if(!destination||destination.length>200)throw new Error("INVALID_PAYOUT_DESTINATION_REF");
    if(!key||key.length>160)throw new Error("INVALID_IDEMPOTENCY_KEY");

    this.providers.get(normalizedProvider);

    return this.db.withActor(actor,async client=>{
      await this.assertRole(client,["owner","accountant"]);

      const source=(await client.query<{
        organization_id:string;property_id:string;reservation_id:string;currency:string;
        owner_payable_minor:string;status:string;ledger_journal_id:string|null;
        reconciliation_status:string|null;
      }>(
        `SELECT
           s.organization_id,s.property_id,s.reservation_id,s.currency,
           s.owner_payable_minor::text,s.status,s.ledger_journal_id,
           r.reconciliation_status
         FROM reservation_economic_snapshots s
         LEFT JOIN reservation_economic_reconciliation r
           ON r.economics_snapshot_id=s.id
        WHERE s.id=$1`,
        [economicsSnapshotId]
      )).rows[0];

      if(!source)throw new Error("PAYOUT_ECONOMICS_NOT_FOUND");
      if(source.status!=="finalized")throw new Error("PAYOUT_ECONOMICS_NOT_FINALIZED");
      if(source.reconciliation_status!=="reconciled"){
        throw new Error("PAYOUT_ECONOMICS_NOT_RECONCILED");
      }
      if(!source.ledger_journal_id)throw new Error("PAYOUT_ECONOMICS_LEDGER_MISSING");

      const amount=BigInt(source.owner_payable_minor);
      if(amount<=0n)throw new Error("PAYOUT_NOT_REQUIRED");

      const access=(await client.query<{allowed:boolean}>(
        "SELECT app.can_access_property($1::uuid) AS allowed",[source.property_id]
      )).rows[0]?.allowed;
      if(!access)throw new Error("PROPERTY_FORBIDDEN");

      const sourceOwnerPayable=await this.sourceOwnerPayableCredit(
        client,source.ledger_journal_id,source.currency
      );
      if(sourceOwnerPayable!==amount)throw new Error("PAYOUT_SOURCE_LEDGER_MISMATCH");

      const requestHash=this.hash({
        economicsSnapshotId,
        provider:normalizedProvider,
        destinationRef:destination,
        amountMinor:amount.toString(),
        currency:source.currency
      });

      const existing=(await client.query<{
        id:string;request_hash:string;status:string;amount_minor:string;currency:string;
      }>(
        `SELECT id,request_hash,status,amount_minor::text,currency
           FROM owner_payout_instructions
          WHERE organization_id=$1 AND idempotency_key=$2`,
        [actor.organizationId,key]
      )).rows[0];

      if(existing){
        if(existing.request_hash!==requestHash)throw new Error("PAYOUT_IDEMPOTENCY_CONFLICT");
        return {
          payoutInstructionId:existing.id,
          status:existing.status,
          amountMinor:existing.amount_minor,
          currency:existing.currency,
          idempotentReplay:true
        };
      }

      const row=(await client.query<{id:string;created_at:Date}>(
        `INSERT INTO owner_payout_instructions(
           id,organization_id,property_id,reservation_id,economics_snapshot_id,
           provider,destination_ref,amount_minor,currency,status,
           idempotency_key,request_hash,created_by_user_id,created_by_membership_id
         ) VALUES(
           gen_random_uuid(),$1,$2,$3,$4,$5,$6,$7,$8,'pending',$9,$10,$11,$12
         )
         RETURNING id,created_at`,
        [
          actor.organizationId,source.property_id,source.reservation_id,economicsSnapshotId,
          normalizedProvider,destination,amount.toString(),source.currency,key,requestHash,
          actor.userId,actor.membershipId
        ]
      )).rows[0];

      await client.query(
        `INSERT INTO audit_log(
           id,organization_id,actor_user_id,actor_membership_id,request_id,
           action,entity_type,entity_id,after_state
         ) VALUES(
           gen_random_uuid(),$1,$2,$3,$4,
           'marketplace.owner_payout_prepared','owner_payout_instruction',$5,$6::jsonb
         )`,
        [
          actor.organizationId,actor.userId,actor.membershipId,actor.requestId,row.id,
          JSON.stringify({
            economicsSnapshotId,provider:normalizedProvider,
            amountMinor:amount.toString(),currency:source.currency
          })
        ]
      );

      return {
        payoutInstructionId:row.id,status:"pending" as const,
        amountMinor:amount.toString(),currency:source.currency,
        createdAt:row.created_at.toISOString(),idempotentReplay:false
      };
    });
  }

  async submitNow(actor:RequestActorContext,payoutInstructionId:string){
    await this.db.withActor(actor,async client=>{
      await this.assertRole(client,["owner","accountant"]);
      const row=(await client.query<{property_id:string}>(
        "SELECT property_id FROM owner_payout_instructions WHERE id=$1",
        [payoutInstructionId]
      )).rows[0];
      if(!row)throw new Error("PAYOUT_NOT_FOUND");
      const access=(await client.query<{allowed:boolean}>(
        "SELECT app.can_access_property($1::uuid) AS allowed",[row.property_id]
      )).rows[0]?.allowed;
      if(!access)throw new Error("PROPERTY_FORBIDDEN");
    });

    const workerToken="manual-payout:"+actor.requestId;
    const claimed=await this.claimOne(actor.organizationId,payoutInstructionId,workerToken);
    if(!claimed){
      const state=await this.getInstruction(actor,payoutInstructionId);
      if(state.status==="confirmed"||state.status==="submitted"){
        return {...state,idempotentReplay:true};
      }
      throw new Error("PAYOUT_NOT_CLAIMABLE");
    }
    return this.executeClaim(claimed,workerToken);
  }

  async processTenantBatch(organizationId:string,limit=20){
    if(!Number.isInteger(limit)||limit<1||limit>100)throw new Error("INVALID_PAYOUT_BATCH_LIMIT");
    const workerToken="payout-worker:"+randomUUID();

    const claimed=await this.db.withOrganization(organizationId,async client=>{
      const rows=await client.query<ClaimedPayout>(
        `WITH candidates AS (
           SELECT id
             FROM owner_payout_instructions
            WHERE organization_id=$1
              AND next_attempt_at<=now()
              AND (
                status IN ('pending','failed')
                OR (status='processing' AND (lease_until IS NULL OR lease_until<=now()))
                OR status='submitted'
              )
            ORDER BY created_at
            FOR UPDATE SKIP LOCKED
            LIMIT $2
         )
         UPDATE owner_payout_instructions p
            SET status='processing',
                lease_until=now()+make_interval(secs=>$3),
                locked_by=$4,
                attempt_count=attempt_count+1,
                updated_at=now()
           FROM candidates c
          WHERE p.id=c.id
         RETURNING
           p.id,p.organization_id,p.property_id,p.reservation_id,p.economics_snapshot_id,
           p.provider,p.destination_ref,p.amount_minor::text,p.currency,p.status,
           p.idempotency_key,p.external_payout_id,p.attempt_count`,
        [organizationId,limit,LEASE_SECONDS,workerToken]
      );
      return rows.rows;
    });

    const results=[];
    for(const instruction of claimed){
      try{
        results.push(await this.executeClaim(instruction,workerToken));
      }catch(error){
        results.push({
          payoutInstructionId:instruction.id,
          status:"failed",
          errorCode:this.errorCode(error)
        });
      }
    }
    return {claimed:claimed.length,results};
  }

  async getInstruction(actor:RequestActorContext,payoutInstructionId:string){
    return this.db.withActor(actor,async client=>{
      await this.assertRole(client,["host","owner","manager","accountant"]);
      const row=(await client.query<{
        id:string;property_id:string;provider:string;amount_minor:string;currency:string;status:string;
        external_payout_id:string|null;attempt_count:number;next_attempt_at:Date;
        last_error_code:string|null;submitted_at:Date|null;confirmed_at:Date|null;
        ledger_journal_id:string|null;reconciliation_status:string|null;
      }>(
        `SELECT
           p.id,p.property_id,p.provider,p.amount_minor::text,p.currency,p.status,
           p.external_payout_id,p.attempt_count,p.next_attempt_at,p.last_error_code,
           p.submitted_at,p.confirmed_at,p.ledger_journal_id,r.reconciliation_status
         FROM owner_payout_instructions p
         LEFT JOIN owner_payout_reconciliation r
           ON r.payout_instruction_id=p.id
        WHERE p.id=$1`,
        [payoutInstructionId]
      )).rows[0];
      if(!row)throw new Error("PAYOUT_NOT_FOUND");
      const access=(await client.query<{allowed:boolean}>(
        "SELECT app.can_access_property($1::uuid) AS allowed",[row.property_id]
      )).rows[0]?.allowed;
      if(!access)throw new Error("PROPERTY_FORBIDDEN");

      return {
        payoutInstructionId:row.id,provider:row.provider,
        amountMinor:row.amount_minor,currency:row.currency,status:row.status,
        externalPayoutId:row.external_payout_id,attemptCount:row.attempt_count,
        nextAttemptAt:row.next_attempt_at.toISOString(),
        lastErrorCode:row.last_error_code,
        submittedAt:row.submitted_at?.toISOString()??null,
        confirmedAt:row.confirmed_at?.toISOString()??null,
        ledgerJournalId:row.ledger_journal_id,
        reconciliationStatus:row.reconciliation_status
      };
    });
  }

  private async claimOne(organizationId:string,id:string,workerToken:string){
    return this.db.withOrganization(organizationId,async client=>{
      return (await client.query<ClaimedPayout>(
        `UPDATE owner_payout_instructions
            SET status='processing',
                lease_until=now()+make_interval(secs=>$3),
                locked_by=$4,
                attempt_count=attempt_count+1,
                updated_at=now()
          WHERE id=$1
            AND organization_id=$2
            AND next_attempt_at<=now()
            AND (
              status IN ('pending','failed')
              OR (status='processing' AND (lease_until IS NULL OR lease_until<=now()))
              OR status='submitted'
            )
          RETURNING
            id,organization_id,property_id,reservation_id,economics_snapshot_id,
            provider,destination_ref,amount_minor::text,currency,status,
            idempotency_key,external_payout_id,attempt_count`,
        [id,organizationId,LEASE_SECONDS,workerToken]
      )).rows[0]??null;
    });
  }

  private async executeClaim(instruction:ClaimedPayout,workerToken:string){
    const adapter=this.providers.get(instruction.provider);
    const requestDigest=this.hash({
      payoutInstructionId:instruction.id,
      economicsSnapshotId:instruction.economics_snapshot_id,
      reservationId:instruction.reservation_id,
      amountMinor:instruction.amount_minor,
      currency:instruction.currency,
      destinationRef:instruction.destination_ref
    });

    try{
      const result=instruction.external_payout_id
        ?await adapter.getStatus({
            payoutInstructionId:instruction.id,
            externalPayoutId:instruction.external_payout_id
          })
        :await adapter.submit({
            payoutInstructionId:instruction.id,
            economicsSnapshotId:instruction.economics_snapshot_id,
            reservationId:instruction.reservation_id,
            amountMinor:BigInt(instruction.amount_minor),
            currency:instruction.currency,
            destinationRef:instruction.destination_ref,
            idempotencyKey:"owner-payout:"+instruction.id
          });

      if(result.status==="failed"){
        throw new Error("PAYOUT_PROVIDER_REPORTED_FAILED");
      }

      if(result.status==="confirmed"){
        return await this.confirmClaim(
          instruction,workerToken,result.externalPayoutId,requestDigest
        );
      }

      await this.db.withOrganization(instruction.organization_id,async client=>{
        await client.query(
          `UPDATE owner_payout_instructions
              SET status='submitted',
                  external_payout_id=$1,
                  submitted_at=COALESCE(submitted_at,now()),
                  next_attempt_at=now()+interval '2 minutes',
                  lease_until=NULL,locked_by=NULL,last_error_code=NULL,updated_at=now()
            WHERE id=$2 AND locked_by=$3`,
          [result.externalPayoutId,instruction.id,workerToken]
        );
        await this.insertAttempt(
          client,instruction,requestDigest,"submitted",result.externalPayoutId,null
        );
      });

      return {
        payoutInstructionId:instruction.id,status:"submitted" as const,
        externalPayoutId:result.externalPayoutId
      };
    }catch(error){
      const code=this.errorCode(error);
      const manualReview=instruction.attempt_count>=MAX_ATTEMPTS;
      const retrySeconds=Math.min(3600,30*Math.pow(2,Math.min(instruction.attempt_count,6)));

      await this.db.withOrganization(instruction.organization_id,async client=>{
        await client.query(
          `UPDATE owner_payout_instructions
              SET status=$1::owner_payout_status,
                  next_attempt_at=now()+make_interval(secs=>$2),
                  lease_until=NULL,locked_by=NULL,last_error_code=$3,updated_at=now()
            WHERE id=$4 AND locked_by=$5`,
          [
            manualReview?"manual_review":"failed",
            Math.floor(retrySeconds),code,instruction.id,workerToken
          ]
        );
        await this.insertAttempt(client,instruction,requestDigest,"failed",null,code);
      });
      throw new Error(code);
    }
  }

  private async confirmClaim(
    instruction:ClaimedPayout,
    workerToken:string,
    externalPayoutId:string,
    requestDigest:string
  ){
    return this.db.withOrganization(instruction.organization_id,async client=>{
      const current=(await client.query<{
        status:string;locked_by:string|null;ledger_journal_id:string|null;
      }>(
        "SELECT status,locked_by,ledger_journal_id FROM owner_payout_instructions WHERE id=$1 FOR UPDATE",
        [instruction.id]
      )).rows[0];
      if(!current)throw new Error("PAYOUT_NOT_FOUND");
      if(current.status==="confirmed"){
        return {
          payoutInstructionId:instruction.id,status:"confirmed" as const,
          externalPayoutId,ledgerJournalId:current.ledger_journal_id,idempotentReplay:true
        };
      }
      if(current.locked_by!==workerToken)throw new Error("PAYOUT_WORKER_LEASE_LOST");

      const journalId=await this.ledger.postOwnerPayout(client,{
        organizationId:instruction.organization_id,
        payoutInstructionId:instruction.id,
        amountMinor:BigInt(instruction.amount_minor),
        currency:instruction.currency,
        idempotencyKey:"owner-payout:"+instruction.id+":confirmed"
      });

      const updated=(await client.query<{confirmed_at:Date}>(
        `UPDATE owner_payout_instructions
            SET status='confirmed',
                external_payout_id=$1,
                submitted_at=COALESCE(submitted_at,now()),
                confirmed_at=now(),
                ledger_journal_id=$2,
                lease_until=NULL,locked_by=NULL,last_error_code=NULL,updated_at=now()
          WHERE id=$3 AND locked_by=$4
          RETURNING confirmed_at`,
        [externalPayoutId,journalId,instruction.id,workerToken]
      )).rows[0];
      if(!updated)throw new Error("PAYOUT_CONFIRM_CONFLICT");

      await this.insertAttempt(
        client,instruction,requestDigest,"confirmed",externalPayoutId,null
      );
      await client.query(
        `INSERT INTO outbox_events(
           id,organization_id,aggregate_type,aggregate_id,event_type,idempotency_key,payload
         ) VALUES(
           gen_random_uuid(),$1,'owner_payout',$2,'marketplace.owner_payout_confirmed.v1',$3,$4::jsonb
         )
         ON CONFLICT(idempotency_key) DO NOTHING`,
        [
          instruction.organization_id,instruction.id,
          "marketplace:owner-payout:"+instruction.id+":confirmed",
          JSON.stringify({
            schemaVersion:1,
            payoutInstructionId:instruction.id,
            economicsSnapshotId:instruction.economics_snapshot_id,
            reservationId:instruction.reservation_id,
            propertyId:instruction.property_id,
            provider:instruction.provider,
            externalPayoutId,
            amountMinor:instruction.amount_minor,
            currency:instruction.currency,
            ledgerJournalId:journalId,
            confirmedAt:updated.confirmed_at.toISOString()
          })
        ]
      );

      return {
        payoutInstructionId:instruction.id,status:"confirmed" as const,
        externalPayoutId,ledgerJournalId:journalId,
        confirmedAt:updated.confirmed_at.toISOString(),idempotentReplay:false
      };
    });
  }

  private async insertAttempt(
    client:PoolClient,
    instruction:ClaimedPayout,
    requestDigest:string,
    status:string,
    externalPayoutId:string|null,
    errorCode:string|null
  ){
    await client.query(
      `INSERT INTO owner_payout_attempts(
         id,payout_instruction_id,attempt_number,provider,idempotency_key,
         request_digest,attempt_status,external_payout_id,error_code
       ) VALUES(gen_random_uuid(),$1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT(payout_instruction_id,attempt_number) DO NOTHING`,
      [
        instruction.id,instruction.attempt_count,instruction.provider,
        "owner-payout:"+instruction.id,requestDigest,status,externalPayoutId,errorCode
      ]
    );
  }

  private async sourceOwnerPayableCredit(
    client:PoolClient,
    journalId:string,
    currency:string
  ){
    const row=(await client.query<{amount:string}>(
      `SELECT COALESCE(SUM(e.amount_minor),0)::text AS amount
         FROM ledger_entries e
         JOIN ledger_accounts a
           ON a.id=e.account_id
          AND a.code='owner_payable'
          AND a.currency=$2
         JOIN ledger_journals j
           ON j.id=e.journal_id
          AND j.status='posted'
        WHERE e.journal_id=$1
          AND e.side='credit'`,
      [journalId,currency]
    )).rows[0];
    return BigInt(row?.amount??"0");
  }

  private async assertRole(client:PoolClient,allowed:string[]){
    const role=(await client.query<{code:string|null}>(
      "SELECT app.current_membership_role() AS code"
    )).rows[0]?.code;
    if(!role||!allowed.includes(role))throw new Error("PAYOUT_ROLE_FORBIDDEN");
  }

  private errorCode(error:unknown){
    const raw=error instanceof Error?error.message:"PAYOUT_PROVIDER_ERROR";
    const normalized=raw.toUpperCase().replace(/[^A-Z0-9_:-]+/g,"_").slice(0,120);
    return normalized||"PAYOUT_PROVIDER_ERROR";
  }

  private hash(value:unknown){
    return createHash("sha256").update(JSON.stringify(value)).digest("hex");
  }
}
