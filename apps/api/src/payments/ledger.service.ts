import {Injectable} from "@nestjs/common";
import type {PoolClient} from "pg";
import {publishLedgerProjection} from "./finance-projection-outbox";

export type LedgerAccountCode=
  |"provider_clearing"
  |"guest_deposits"
  |"refunds_payable"
  |"platform_commission_revenue"
  |"owner_payable"
  |"taxes_payable"
  |"other_deductions_payable";

@Injectable()
export class LedgerService{
  async ensureAccount(client:PoolClient,organizationId:string,code:LedgerAccountCode,currency:string){
    const config={
      provider_clearing:{name:"Provider Clearing",type:"asset"},
      guest_deposits:{name:"Guest Deposits",type:"liability"},
      refunds_payable:{name:"Refunds Payable",type:"liability"},
      platform_commission_revenue:{name:"Platform Commission Revenue",type:"revenue"},
      owner_payable:{name:"Owner Payable",type:"liability"},
      taxes_payable:{name:"Taxes Withheld Payable",type:"liability"},
      other_deductions_payable:{name:"Other Deductions Payable",type:"liability"}
    } as const;
    const row=config[code];
    const result=await client.query<{id:string}>(
      `INSERT INTO ledger_accounts(id,organization_id,code,name,account_type,currency)
       VALUES(gen_random_uuid(),$1,$2,$3,$4,$5)
       ON CONFLICT(organization_id,code,currency) DO UPDATE SET name=EXCLUDED.name
       RETURNING id`,
      [organizationId,code,row.name,row.type,currency]
    );
    return result.rows[0].id;
  }

  async postCapture(
    client:PoolClient,
    input:{organizationId:string;paymentIntentId:string;amountMinor:bigint;currency:string;idempotencyKey:string}
  ){
    return this.postTwoSided(client,{
      ...input,
      description:"Guest payment captured",
      debitCode:"provider_clearing",
      creditCode:"guest_deposits",
      debitMemo:"Provider receivable / clearing",
      creditMemo:"Guest deposit liability"
    });
  }

  async postLateCapture(
    client:PoolClient,
    input:{organizationId:string;paymentIntentId:string;amountMinor:bigint;currency:string;idempotencyKey:string}
  ){
    return this.postTwoSided(client,{
      ...input,
      description:"Late capture pending refund",
      debitCode:"provider_clearing",
      creditCode:"refunds_payable",
      debitMemo:"Provider receivable / clearing",
      creditMemo:"Customer refund payable"
    });
  }

  async postRefundReclassification(
    client:PoolClient,
    input:{
      organizationId:string;paymentIntentId:string;amountMinor:bigint;currency:string;
      idempotencyKey:string;
    }
  ){
    return this.postTwoSided(client,{
      ...input,
      description:"Reclassify guest deposit to refund payable",
      debitCode:"guest_deposits",
      creditCode:"refunds_payable",
      debitMemo:"Remove refundable guest deposit liability",
      creditMemo:"Recognize customer refund payable"
    });
  }

  async postRefund(
    client:PoolClient,
    input:{
      organizationId:string;paymentIntentId:string;amountMinor:bigint;currency:string;
      idempotencyKey:string;liabilityCode?:"guest_deposits"|"refunds_payable";
    }
  ){
    const liability=input.liabilityCode??"guest_deposits";
    return this.postTwoSided(client,{
      organizationId:input.organizationId,paymentIntentId:input.paymentIntentId,
      amountMinor:input.amountMinor,currency:input.currency,idempotencyKey:input.idempotencyKey,
      description:"Guest payment refunded",
      debitCode:liability,
      creditCode:"provider_clearing",
      debitMemo:liability==="refunds_payable"?"Settle customer refund payable":"Reduce guest deposit liability",
      creditMemo:"Reduce provider clearing"
    });
  }

  async postMarketplaceEconomics(
    client:PoolClient,
    input:{
      organizationId:string;
      snapshotId:string;
      reservationId:string;
      currency:string;
      netCollectedMinor:bigint;
      platformCommissionMinor:bigint;
      ownerPayableMinor:bigint;
      taxesWithheldMinor:bigint;
      otherDeductionsMinor:bigint;
      idempotencyKey:string;
    }
  ){
    const components=[
      input.platformCommissionMinor,
      input.ownerPayableMinor,
      input.taxesWithheldMinor,
      input.otherDeductionsMinor
    ];
    if(components.some(x=>x<0n)||input.netCollectedMinor<0n)throw new Error("INVALID_LEDGER_AMOUNT");
    if(components.reduce((sum,x)=>sum+x,0n)!==input.netCollectedMinor){
      throw new Error("ECONOMICS_LEDGER_NOT_BALANCED");
    }
    if(input.netCollectedMinor===0n)return null;

    const existing=await client.query<{id:string}>(
      "SELECT id FROM ledger_journals WHERE organization_id=$1 AND idempotency_key=$2",
      [input.organizationId,input.idempotencyKey]
    );
    if(existing.rows[0])return existing.rows[0].id;

    const debit=await this.ensureAccount(
      client,input.organizationId,"guest_deposits",input.currency
    );
    const credits:Array<{code:LedgerAccountCode;amount:bigint;memo:string}>=[
      {
        code:"platform_commission_revenue",
        amount:input.platformCommissionMinor,
        memo:"Platform commission earned"
      },
      {
        code:"owner_payable",
        amount:input.ownerPayableMinor,
        memo:"Owner settlement payable"
      },
      {
        code:"taxes_payable",
        amount:input.taxesWithheldMinor,
        memo:"Taxes withheld for settlement"
      },
      {
        code:"other_deductions_payable",
        amount:input.otherDeductionsMinor,
        memo:"Other settlement deductions"
      }
    ].filter(x=>x.amount>0n);

    const journalId=(await client.query<{id:string}>(
      `INSERT INTO ledger_journals(
         id,organization_id,reference_type,reference_id,idempotency_key,description
       ) VALUES(
         gen_random_uuid(),$1,'reservation_economics',$2,$3,'Finalize reservation marketplace economics'
       )
       RETURNING id`,
      [input.organizationId,input.snapshotId,input.idempotencyKey]
    )).rows[0].id;

    await client.query(
      `INSERT INTO ledger_entries(id,journal_id,account_id,side,amount_minor,currency,memo)
       VALUES(gen_random_uuid(),$1,$2,'debit',$3,$4,$5)`,
      [
        journalId,debit,input.netCollectedMinor.toString(),input.currency,
        "Release settled guest deposit liability"
      ]
    );

    for(const credit of credits){
      const account=await this.ensureAccount(
        client,input.organizationId,credit.code,input.currency
      );
      await client.query(
        `INSERT INTO ledger_entries(id,journal_id,account_id,side,amount_minor,currency,memo)
         VALUES(gen_random_uuid(),$1,$2,'credit',$3,$4,$5)`,
        [journalId,account,credit.amount.toString(),input.currency,credit.memo]
      );
    }

    await client.query(
      "UPDATE ledger_journals SET status='posted',posted_at=now() WHERE id=$1",
      [journalId]
    );
    await publishLedgerProjection(client,input.organizationId,journalId);
    return journalId;
  }

  private async postTwoSided(
    client:PoolClient,
    input:{
      organizationId:string;paymentIntentId:string;amountMinor:bigint;currency:string;idempotencyKey:string;
      description:string;debitCode:LedgerAccountCode;creditCode:LedgerAccountCode;
      debitMemo:string;creditMemo:string;
    }
  ){
    if(input.amountMinor<=0n)throw new Error("INVALID_LEDGER_AMOUNT");
    const existing=await client.query<{id:string}>(
      "SELECT id FROM ledger_journals WHERE organization_id=$1 AND idempotency_key=$2",
      [input.organizationId,input.idempotencyKey]
    );
    if(existing.rows[0])return existing.rows[0].id;

    const debit=await this.ensureAccount(client,input.organizationId,input.debitCode,input.currency);
    const credit=await this.ensureAccount(client,input.organizationId,input.creditCode,input.currency);
    const journalId=(await client.query<{id:string}>(
      `INSERT INTO ledger_journals(id,organization_id,reference_type,reference_id,idempotency_key,description)
       VALUES(gen_random_uuid(),$1,'payment_intent',$2,$3,$4)
       RETURNING id`,
      [input.organizationId,input.paymentIntentId,input.idempotencyKey,input.description]
    )).rows[0].id;

    await client.query(
      `INSERT INTO ledger_entries(id,journal_id,account_id,side,amount_minor,currency,memo)
       VALUES
       (gen_random_uuid(),$1,$2,'debit',$4,$5,$6),
       (gen_random_uuid(),$1,$3,'credit',$4,$5,$7)`,
      [
        journalId,debit,credit,input.amountMinor.toString(),input.currency,
        input.debitMemo,input.creditMemo
      ]
    );
    await client.query(
      "UPDATE ledger_journals SET status='posted',posted_at=now() WHERE id=$1",
      [journalId]
    );
    await publishLedgerProjection(client,input.organizationId,journalId);
    return journalId;
  }
}
