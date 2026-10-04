import {Injectable} from "@nestjs/common";
import type {PoolClient} from "pg";

type LedgerAccountCode="provider_clearing"|"guest_deposits";

@Injectable()
export class LedgerService{
  async ensureAccount(client:PoolClient,organizationId:string,code:LedgerAccountCode,currency:string){
    const config={
      provider_clearing:{name:"Provider Clearing",type:"asset"},
      guest_deposits:{name:"Guest Deposits",type:"liability"}
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
    const existing=await client.query<{id:string}>(
      "SELECT id FROM ledger_journals WHERE organization_id=$1 AND idempotency_key=$2",
      [input.organizationId,input.idempotencyKey]
    );
    if(existing.rows[0])return existing.rows[0].id;

    const clearing=await this.ensureAccount(client,input.organizationId,"provider_clearing",input.currency);
    const deposits=await this.ensureAccount(client,input.organizationId,"guest_deposits",input.currency);
    const journalId=(await client.query<{id:string}>(
      `INSERT INTO ledger_journals(id,organization_id,reference_type,reference_id,idempotency_key,description)
       VALUES(gen_random_uuid(),$1,'payment_intent',$2,$3,'Guest payment captured')
       RETURNING id`,
      [input.organizationId,input.paymentIntentId,input.idempotencyKey]
    )).rows[0].id;

    await client.query(
      `INSERT INTO ledger_entries(id,journal_id,account_id,side,amount_minor,currency,memo)
       VALUES
       (gen_random_uuid(),$1,$2,'debit',$4,$5,'Provider receivable / clearing'),
       (gen_random_uuid(),$1,$3,'credit',$4,$5,'Guest deposit liability')`,
      [journalId,clearing,deposits,input.amountMinor.toString(),input.currency]
    );
    await client.query(
      "UPDATE ledger_journals SET status='posted',posted_at=now() WHERE id=$1",
      [journalId]
    );
    return journalId;
  }

  async postRefund(
    client:PoolClient,
    input:{organizationId:string;paymentIntentId:string;amountMinor:bigint;currency:string;idempotencyKey:string}
  ){
    const existing=await client.query<{id:string}>(
      "SELECT id FROM ledger_journals WHERE organization_id=$1 AND idempotency_key=$2",
      [input.organizationId,input.idempotencyKey]
    );
    if(existing.rows[0])return existing.rows[0].id;

    const clearing=await this.ensureAccount(client,input.organizationId,"provider_clearing",input.currency);
    const deposits=await this.ensureAccount(client,input.organizationId,"guest_deposits",input.currency);
    const journalId=(await client.query<{id:string}>(
      `INSERT INTO ledger_journals(id,organization_id,reference_type,reference_id,idempotency_key,description)
       VALUES(gen_random_uuid(),$1,'payment_intent',$2,$3,'Guest payment refunded')
       RETURNING id`,
      [input.organizationId,input.paymentIntentId,input.idempotencyKey]
    )).rows[0].id;

    await client.query(
      `INSERT INTO ledger_entries(id,journal_id,account_id,side,amount_minor,currency,memo)
       VALUES
       (gen_random_uuid(),$1,$2,'debit',$4,$5,'Reduce guest deposit liability'),
       (gen_random_uuid(),$1,$3,'credit',$4,$5,'Reduce provider clearing')`,
      [journalId,deposits,clearing,input.amountMinor.toString(),input.currency]
    );
    await client.query("UPDATE ledger_journals SET status='posted',posted_at=now() WHERE id=$1",[journalId]);
    return journalId;
  }
}
