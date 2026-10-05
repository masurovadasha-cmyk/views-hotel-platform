import type {PoolClient} from "pg";

export type PaymentProjectionSnapshotV1={
  schemaVersion:1;
  paymentIntentId:string;
  organizationId:string;
  propertyId:string;
  reservationId:string;
  provider:string;
  status:string;
  amountMinor:string;
  capturedMinor:string;
  refundedMinor:string;
  currency:string;
  sourceVersion:number;
  sourceUpdatedAt:string;
};

export type LedgerProjectionEntryV1={
  id:string;
  accountCode:string;
  accountType:string;
  side:"debit"|"credit";
  amountMinor:string;
  currency:string;
  memo:string|null;
};

export type LedgerProjectionSnapshotV1={
  schemaVersion:1;
  journalId:string;
  organizationId:string;
  propertyId:string;
  referenceType:string;
  referenceId:string;
  description:string;
  status:"posted";
  postedAt:string;
  entries:LedgerProjectionEntryV1[];
};

export function paymentProjectionIdempotencyKey(paymentIntentId:string,version:number){
  return "finance-payment-projection:"+paymentIntentId+":v"+version;
}

export function ledgerProjectionIdempotencyKey(journalId:string){
  return "finance-ledger-projection:"+journalId+":posted";
}

export async function publishPaymentProjection(
  client:PoolClient,
  organizationId:string,
  paymentIntentId:string
){
  const row=(await client.query<{
    id:string;organization_id:string;reservation_id:string;provider:string;status:string;
    amount_minor:string;captured_minor:string;refunded_minor:string;currency:string;
    version:number;updated_at:Date;property_id:string;
  }>(
    `SELECT pi.id,pi.organization_id,pi.reservation_id,pi.provider,pi.status,
            pi.amount_minor::text,pi.captured_minor::text,pi.refunded_minor::text,
            pi.currency,pi.version,pi.updated_at,r.property_id
       FROM payment_intents pi
       JOIN reservations r ON r.id=pi.reservation_id
      WHERE pi.id=$1 AND pi.organization_id=$2`,
    [paymentIntentId,organizationId]
  )).rows[0];
  if(!row)throw new Error("PAYMENT_PROJECTION_SOURCE_NOT_FOUND");

  const snapshot:PaymentProjectionSnapshotV1={
    schemaVersion:1,
    paymentIntentId:row.id,
    organizationId:row.organization_id,
    propertyId:row.property_id,
    reservationId:row.reservation_id,
    provider:row.provider,
    status:row.status,
    amountMinor:row.amount_minor,
    capturedMinor:row.captured_minor,
    refundedMinor:row.refunded_minor,
    currency:row.currency,
    sourceVersion:row.version,
    sourceUpdatedAt:row.updated_at.toISOString()
  };
  const key=paymentProjectionIdempotencyKey(row.id,row.version);

  await client.query(
    `INSERT INTO outbox_events(
       id,organization_id,aggregate_type,aggregate_id,event_type,idempotency_key,payload
     )
     VALUES(gen_random_uuid(),$1,'payment_intent',$2,'finance.payment_snapshot.v1',$3,$4::jsonb)
     ON CONFLICT(idempotency_key) DO NOTHING`,
    [organizationId,row.id,key,JSON.stringify(snapshot)]
  );
  return snapshot;
}

export async function publishLedgerProjection(
  client:PoolClient,
  organizationId:string,
  journalId:string
){
  const journal=(await client.query<{
    id:string;organization_id:string;reference_type:string;reference_id:string;
    description:string;status:string;posted_at:Date|null;property_id:string;
  }>(
    `SELECT
        j.id,j.organization_id,j.reference_type,j.reference_id,j.description,j.status,j.posted_at,
        COALESCE(
          payment_reservation.property_id,
          economics.property_id,
          payout.property_id
        ) AS property_id
       FROM ledger_journals j
       LEFT JOIN payment_intents pi
         ON j.reference_type='payment_intent'
        AND pi.id=j.reference_id
       LEFT JOIN reservations payment_reservation
         ON payment_reservation.id=pi.reservation_id
       LEFT JOIN reservation_economic_snapshots economics
         ON j.reference_type='reservation_economics'
        AND economics.id=j.reference_id
       LEFT JOIN owner_payout_instructions payout
         ON j.reference_type='owner_payout'
        AND payout.id=j.reference_id
      WHERE j.id=$1
        AND j.organization_id=$2
        AND COALESCE(
          payment_reservation.property_id,
          economics.property_id,
          payout.property_id
        ) IS NOT NULL`,
    [journalId,organizationId]
  )).rows[0];
  if(!journal)throw new Error("LEDGER_PROJECTION_SOURCE_NOT_FOUND");
  if(journal.status!=="posted"||!journal.posted_at)throw new Error("LEDGER_PROJECTION_REQUIRES_POSTED_JOURNAL");

  const entries=(await client.query<{
    id:string;account_code:string;account_type:string;side:"debit"|"credit";
    amount_minor:string;currency:string;memo:string|null;
  }>(
    `SELECT e.id,a.code AS account_code,a.account_type,e.side,e.amount_minor::text,e.currency,e.memo
       FROM ledger_entries e
       JOIN ledger_accounts a ON a.id=e.account_id
      WHERE e.journal_id=$1
      ORDER BY e.id`,
    [journalId]
  )).rows;
  if(entries.length<2)throw new Error("LEDGER_PROJECTION_ENTRIES_MISSING");

  let debit=0n,credit=0n;
  const currencies=new Set<string>();
  const mapped:LedgerProjectionEntryV1[]=entries.map(entry=>{
    const amount=BigInt(entry.amount_minor);
    currencies.add(entry.currency);
    if(entry.side==="debit")debit+=amount;
    else credit+=amount;
    return {
      id:entry.id,
      accountCode:entry.account_code,
      accountType:entry.account_type,
      side:entry.side,
      amountMinor:entry.amount_minor,
      currency:entry.currency,
      memo:entry.memo
    };
  });
  if(currencies.size!==1||debit!==credit)throw new Error("LEDGER_PROJECTION_UNBALANCED");

  const snapshot:LedgerProjectionSnapshotV1={
    schemaVersion:1,
    journalId:journal.id,
    organizationId:journal.organization_id,
    propertyId:journal.property_id,
    referenceType:journal.reference_type,
    referenceId:journal.reference_id,
    description:journal.description,
    status:"posted",
    postedAt:journal.posted_at.toISOString(),
    entries:mapped
  };
  const key=ledgerProjectionIdempotencyKey(journal.id);

  await client.query(
    `INSERT INTO outbox_events(
       id,organization_id,aggregate_type,aggregate_id,event_type,idempotency_key,payload
     )
     VALUES(gen_random_uuid(),$1,'ledger_journal',$2,'finance.ledger_journal.v1',$3,$4::jsonb)
     ON CONFLICT(idempotency_key) DO NOTHING`,
    [organizationId,journal.id,key,JSON.stringify(snapshot)]
  );
  return snapshot;
}