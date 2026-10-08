import {ledgerReplay} from './ledger-replay';
import {Injectable} from "@nestjs/common";
import type {PoolClient} from "pg";
import {publishLedgerProjection} from "./finance-projection-outbox";

export type LedgerAccountCode="provider_clearing"|"guest_deposits"|"refunds_payable"|"platform_commission_revenue"|"owner_payable"|"taxes_payable"|"other_deductions_payable";

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
       ON CONFLICT(organization_id,code,currency) DO NOTHING
       RETURNING id`,
      [organizationId,code,row.name,row.type,currency]
    );
    if(result.rows[0])return result.rows[0].id;
    const existing=(await client.query<{id:string;account_type:string;active:boolean}>(
      'SELECT id,account_type,active FROM ledger_accounts WHERE organization_id=$1 AND code=$2 AND currency=$3 FOR SHARE',
      [organizationId,code,currency])).rows[0];
    if(!existing||!existing.active||existing.account_type!==row.type)throw Error('LEDGER_ACCOUNT_UNAVAILABLE');
    return existing.id;
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
      input.platformCommissionMinor,input.ownerPayableMinor,
      input.taxesWithheldMinor,input.otherDeductionsMinor
    ];
    if(input.netCollectedMinor<0n||components.some(x=>x<0n)){
      throw new Error("INVALID_LEDGER_AMOUNT");
    }
    if(components.reduce((sum,x)=>sum+x,0n)!==input.netCollectedMinor){
      throw new Error("ECONOMICS_LEDGER_NOT_BALANCED");
    }
    const creditCandidates:Array<{code:LedgerAccountCode;amount:bigint;memo:string}>=[
      {code:"platform_commission_revenue",amount:input.platformCommissionMinor,memo:"Platform commission earned"},
      {code:"owner_payable",amount:input.ownerPayableMinor,memo:"Owner settlement payable"},
      {code:"taxes_payable",amount:input.taxesWithheldMinor,memo:"Taxes withheld for settlement"},
      {code:"other_deductions_payable",amount:input.otherDeductionsMinor,memo:"Other settlement deductions"}
    ];
    const credits=creditCandidates.filter(x=>x.amount>0n);
    const existing=await ledgerReplay(client,{...input,referenceType:'reservation_economics',referenceId:input.snapshotId,
      lines:input.netCollectedMinor===0n?[]:[{code:'guest_deposits',side:'debit',amountMinor:input.netCollectedMinor,currency:input.currency},
        ...credits.map(c=>({code:c.code,side:'credit' as const,amountMinor:c.amount,currency:input.currency}))]});
    if(existing)return existing;
    if(input.netCollectedMinor===0n)return null;
    const accounts=await this.accounts(client,input.organizationId,input.currency,['guest_deposits',...credits.map(c=>c.code)]);
    const debit=accounts.get('guest_deposits')!;

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
      const account=accounts.get(credit.code)!;
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

  private async accounts(client:PoolClient,organizationId:string,currency:string,codes:LedgerAccountCode[]){
    if(!/^[A-Z]{3}$/.test(currency))throw Error('INVALID_LEDGER_CURRENCY');
    const result=new Map<LedgerAccountCode,string>();
    for(const code of [...new Set(codes)].sort())result.set(code,await this.ensureAccount(client,organizationId,code,currency));
    return result;
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
    const existing=await ledgerReplay(client,{...input,referenceType:'payment_intent',referenceId:input.paymentIntentId,lines:[
      {code:input.debitCode,side:'debit',amountMinor:input.amountMinor,currency:input.currency},
      {code:input.creditCode,side:'credit',amountMinor:input.amountMinor,currency:input.currency}]});
    if(existing)return existing;
    const accounts=await this.accounts(client,input.organizationId,input.currency,[input.debitCode,input.creditCode]);
    const debit=accounts.get(input.debitCode)!,credit=accounts.get(input.creditCode)!;
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
