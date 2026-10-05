import {afterAll,beforeAll,describe,expect,it} from "vitest";
import {DatabaseService} from "../database/database.service";
import {AnalyticsProjectionService} from "../analytics/analytics-projection.service";
import {MarketplaceAnalyticsQueryService} from "../analytics/marketplace-analytics-query.service";
import {LedgerService} from "../payments/ledger.service";
import {MarketplaceEconomicsService} from "./marketplace-economics.service";

const ORG="00000000-0000-0000-0000-000000000001";
const PROPERTY="00000000-0000-0000-0000-000000000002";
const UNIT="00000000-0000-0000-0000-000000000004";
const RATE="00000000-0000-0000-0000-000000000008";
const USER="20000000-0000-4000-8000-000000000001";
const MEMBERSHIP="30000000-0000-4000-8000-000000000001";

const QUOTE="a9000000-0000-4000-8000-000000000001";
const RESERVATION="a9000000-0000-4000-8000-000000000002";
const PAYMENT="a9000000-0000-4000-8000-000000000003";
const STALE_QUOTE="a9000000-0000-4000-8000-000000000004";
const STALE_RESERVATION="a9000000-0000-4000-8000-000000000005";
const STALE_PAYMENT="a9000000-0000-4000-8000-000000000006";

const actor={
  organizationId:ORG,userId:USER,membershipId:MEMBERSHIP,requestId:"marketplace-economics-test"
};

const db=new DatabaseService();
const ledger=new LedgerService();
const economics=new MarketplaceEconomicsService(db,ledger);
const projector=new AnalyticsProjectionService(db);
const analytics=new MarketplaceAnalyticsQueryService(db);

beforeAll(async()=>{
  await db.withActor(actor,async client=>{
    await client.query(
      "INSERT INTO booking_quotes(id,organization_id,property_id,unit_id,rate_plan_id,check_in_at,check_out_at,guest_context,currency,accommodation_minor,discount_minor,charges_minor,total_minor,cancellation_policy_snapshot,pricing_snapshot,input_hash,expires_at) VALUES($1,$2,$3,$4,$5,\'2028-05-10T14:00:00+05\',\'2028-05-12T12:00:00+05\',\'{}\'::jsonb,\'UZS\',1000,0,0,1000,\'{}\'::jsonb,\'{}\'::jsonb,\'economics-main\',now()+interval \'1 day\'),($6,$2,$3,$4,$5,\'2028-06-10T14:00:00+05\',\'2028-06-12T12:00:00+05\',\'{}\'::jsonb,\'UZS\',1000,0,0,1000,\'{}\'::jsonb,\'{}\'::jsonb,\'economics-stale\',now()+interval \'1 day\') ON CONFLICT(id) DO NOTHING",
      [QUOTE,ORG,PROPERTY,UNIT,RATE,STALE_QUOTE]
    );

    await client.query(
      "INSERT INTO reservations(id,organization_id,property_id,unit_id,rate_plan_id,confirmation_code,status,check_in_at,check_out_at,currency,accommodation_minor,total_minor,cancellation_policy_snapshot,quote_snapshot,created_at,updated_at,version) VALUES($1,$3,$4,$5,$6,\'VW-ECON-MAIN\',\'checked_out\',\'2028-05-10T14:00:00+05\',\'2028-05-12T12:00:00+05\',\'UZS\',1000,1000,\'{}\'::jsonb,\'{\"bookingChannel\":\"Direct Web\",\"marketSegment\":\"Leisure\"}\'::jsonb,\'2028-04-10T12:00:00+05\',now(),2),($2,$3,$4,$5,$6,\'VW-ECON-STALE\',\'checked_out\',\'2028-06-10T14:00:00+05\',\'2028-06-12T12:00:00+05\',\'UZS\',1000,1000,\'{}\'::jsonb,\'{}\'::jsonb,\'2028-05-10T12:00:00+05\',now(),2) ON CONFLICT(id) DO NOTHING",
      [RESERVATION,STALE_RESERVATION,ORG,PROPERTY,UNIT,RATE]
    );

    await client.query(
      "INSERT INTO payment_intents(id,organization_id,reservation_id,quote_id,provider,status,amount_minor,currency,idempotency_key,captured_minor,refunded_minor,version,created_at,updated_at) VALUES($1,$2,$3,$4,\'test-provider\',\'captured\',1000,\'UZS\',\'economics-payment-main\',1000,0,2,now(),now()),($5,$2,$6,$7,\'test-provider\',\'captured\',1000,\'UZS\',\'economics-payment-stale\',1000,0,2,now(),now()) ON CONFLICT(id) DO NOTHING",
      [PAYMENT,ORG,RESERVATION,QUOTE,STALE_PAYMENT,STALE_RESERVATION,STALE_QUOTE]
    );

    await ledger.postCapture(client,{
      organizationId:ORG,paymentIntentId:PAYMENT,amountMinor:1000n,currency:"UZS",
      idempotencyKey:"economics-ledger-capture-main"
    });
    await ledger.postCapture(client,{
      organizationId:ORG,paymentIntentId:STALE_PAYMENT,amountMinor:1000n,currency:"UZS",
      idempotencyKey:"economics-ledger-capture-stale"
    });
  });
});

describe.sequential("marketplace reservation economics",()=>{
  it("rejects an allocation that does not equal payment-derived net collected",async()=>{
    await expect(economics.createDraft(actor,RESERVATION,"economics-mismatch",{
      platformCommissionMinor:"150",
      ownerPayableMinor:"700",
      taxesWithheldMinor:"30",
      otherDeductionsMinor:"20",
      sourceKind:"manual"
    })).rejects.toThrow("ECONOMICS_ALLOCATION_MISMATCH");
  });

  it("creates an exact draft and replays the same idempotency key",async()=>{
    const input={
      platformCommissionMinor:"150",
      ownerPayableMinor:"800",
      taxesWithheldMinor:"30",
      otherDeductionsMinor:"20",
      sourceKind:"contract" as const,
      sourceReference:"owner-contract-test-v1"
    };
    const first=await economics.createDraft(actor,RESERVATION,"economics-main-v1",input);
    const replay=await economics.createDraft(actor,RESERVATION,"economics-main-v1",input);

    expect(first.status).toBe("draft");
    expect(first.netCollectedMinor).toBe("1000");
    expect(first.currency).toBe("UZS");
    expect(first.idempotentReplay).toBe(false);
    expect(replay.snapshotId).toBe(first.snapshotId);
    expect(replay.idempotentReplay).toBe(true);

    const row=await db.withActor(actor,async client=>
      (await client.query<{
        platform_commission_minor:string;owner_payable_minor:string;
        taxes_withheld_minor:string;other_deductions_minor:string;net_collected_minor:string;
      }>(
        "SELECT platform_commission_minor::text,owner_payable_minor::text,taxes_withheld_minor::text,other_deductions_minor::text,net_collected_minor::text FROM reservation_economic_snapshots WHERE id=$1",
        [first.snapshotId]
      )).rows[0]
    );
    expect(BigInt(row.platform_commission_minor)+BigInt(row.owner_payable_minor)+BigInt(row.taxes_withheld_minor)+BigInt(row.other_deductions_minor)).toBe(BigInt(row.net_collected_minor));
  });

  it("finalizes immutably and emits one exact marketplace event",async()=>{
    const snapshots=await economics.reservationSnapshots(actor,RESERVATION);
    const draft=snapshots.find(x=>x.status==="draft");
    if(!draft)throw new Error("EXPECTED_ECONOMICS_DRAFT");

    const finalized=await economics.finalize(actor,draft.snapshotId);
    const replay=await economics.finalize(actor,draft.snapshotId);
    expect(finalized.status).toBe("finalized");
    expect(finalized.idempotentReplay).toBe(false);
    expect(replay.idempotentReplay).toBe(true);
    expect(finalized.ledgerJournalId).toBeTruthy();

    const ledgerState=await db.withActor(actor,async client=>{
      const entries=(await client.query<{code:string;side:string;amount_minor:string}>(
        `SELECT a.code,e.side,e.amount_minor::text
           FROM ledger_entries e
           JOIN ledger_accounts a ON a.id=e.account_id
          WHERE e.journal_id=$1
          ORDER BY e.side,a.code`,
        [finalized.ledgerJournalId]
      )).rows;
      const reconciliation=(await client.query<{reconciliation_status:string;net_drift_minor:string}>(
        `SELECT reconciliation_status,net_drift_minor::text
           FROM reservation_economic_reconciliation
          WHERE economics_snapshot_id=$1`,
        [draft.snapshotId]
      )).rows[0];
      return {entries,reconciliation};
    });
    expect(ledgerState.entries).toEqual(expect.arrayContaining([
      expect.objectContaining({code:"guest_deposits",side:"debit",amount_minor:"1000"}),
      expect.objectContaining({code:"platform_commission_revenue",side:"credit",amount_minor:"150"}),
      expect.objectContaining({code:"owner_payable",side:"credit",amount_minor:"800"}),
      expect.objectContaining({code:"taxes_payable",side:"credit",amount_minor:"30"}),
      expect.objectContaining({code:"other_deductions_payable",side:"credit",amount_minor:"20"})
    ]));
    expect(ledgerState.reconciliation.reconciliation_status).toBe("reconciled");
    expect(ledgerState.reconciliation.net_drift_minor).toBe("0");

    const event=await db.withActor(actor,async client=>
      (await client.query<{payload:{
        schemaVersion:number;reservationId:string;netCollectedMinor:string;
        platformCommissionMinor:string;ownerPayableMinor:string;taxesWithheldMinor:string;
        otherDeductionsMinor:string;
      }}>(
        "SELECT payload FROM outbox_events WHERE aggregate_type=\'reservation\' AND aggregate_id=$1 AND event_type=\'marketplace.reservation_economics.v1\' LIMIT 1",
        [RESERVATION]
      )).rows[0]
    );
    expect(event.payload).toMatchObject({
      schemaVersion:1,reservationId:RESERVATION,netCollectedMinor:"1000",
      platformCommissionMinor:"150",ownerPayableMinor:"800",
      taxesWithheldMinor:"30",otherDeductionsMinor:"20"
    });

    await expect(db.withActor(actor,async client=>{
      await client.query(
        "UPDATE reservation_economic_snapshots SET owner_payable_minor=799 WHERE id=$1",
        [draft.snapshotId]
      );
    })).rejects.toThrow(/finalized reservation economics are immutable/i);
  });

  it("projects finalized economics into truthful arrival analytics",async()=>{
    for(let i=0;i<12;i++){
      const result=await projector.processBatch(actor,500);
      if(result.scanned===0)break;
    }

    const rows=await analytics.propertyEconomics(
      actor,PROPERTY,"2028-05-10","2028-05-10","Direct Web","Leisure"
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      arrivalDate:"2028-05-10",
      currency:"UZS",
      bookingChannel:"direct_web",
      marketSegment:"leisure",
      reservationCount:1,
      netCollectedMinor:"1000",
      platformCommissionMinor:"150",
      ownerPayableMinor:"800",
      taxesWithheldMinor:"30",
      otherDeductionsMinor:"20"
    });
    expect(rows[0].platformCommissionRate).toBe(0.15);
    expect(rows[0].ownerPayableRate).toBe(0.8);

    const fact=await db.withActor(actor,async client=>
      (await client.query<{source_version:number;source_snapshot_id:string;source_kind:string}>(
        "SELECT source_version,source_snapshot_id,source_kind FROM analytics_marketplace_economic_facts WHERE reservation_id=$1",
        [RESERVATION]
      )).rows[0]
    );
    expect(fact.source_version).toBe(1);
    expect(fact.source_snapshot_id).toBeTruthy();
    expect(fact.source_kind).toBe("contract");

    const stayRows=await analytics.propertyStayEconomics(
      actor,PROPERTY,"2028-05-10","2028-05-11","Direct Web","Leisure"
    );
    expect(stayRows).toHaveLength(2);
    expect(stayRows[0]).toMatchObject({
      date:"2028-05-10",netCollectedMinor:"500",platformCommissionMinor:"75",
      ownerPayableMinor:"400",taxesWithheldMinor:"15",otherDeductionsMinor:"10"
    });
    expect(stayRows[1]).toMatchObject({
      date:"2028-05-11",netCollectedMinor:"500",platformCommissionMinor:"75",
      ownerPayableMinor:"400",taxesWithheldMinor:"15",otherDeductionsMinor:"10"
    });
  });
  it("blocks finalization when collected money changed after draft creation",async()=>{
    const draft=await economics.createDraft(actor,STALE_RESERVATION,"economics-stale-v1",{
      platformCommissionMinor:"100",
      ownerPayableMinor:"900",
      sourceKind:"manual"
    });

    await db.withActor(actor,async client=>{
      await client.query(
        "UPDATE payment_intents SET status=\'partially_refunded\',refunded_minor=100,version=version+1,updated_at=now() WHERE id=$1",
        [STALE_PAYMENT]
      );
    });

    await expect(economics.finalize(actor,draft.snapshotId))
      .rejects.toThrow("ECONOMICS_PAYMENT_STATE_CHANGED");
  });
});

afterAll(async()=>{await db.onModuleDestroy()});