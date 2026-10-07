import {afterAll,beforeAll,describe,expect,it} from "vitest";
import {DatabaseService} from "../database/database.service";
import type {DocumentUploadVaultPort} from "./document-upload-vault.port";
import {FiscalizationService} from "./fiscalization.service";
import {GuestDocumentService} from "./guest-document.service";
import type {FiscalizationProviderPort} from "./fiscalization-provider.port";
import {GuestRegistrationService} from "./guest-registration.service";
import {RegistrationDeadlineService} from "./registration-deadline.service";
import type {GuestRegistrationProviderPort} from "./guest-registration-provider.port";
import {ComplianceProviderRegistry} from "./provider.registry";

const ORG="00000000-0000-0000-0000-000000000001";
const PROPERTY="00000000-0000-0000-0000-000000000002";
const UNIT="00000000-0000-0000-0000-000000000004";
const RATE="00000000-0000-0000-0000-000000000008";
const USER="20000000-0000-4000-8000-000000000001";
const MEMBERSHIP="30000000-0000-4000-8000-000000000001";

const RESERVATION="91000000-0000-4000-8000-000000000001";
const RES_GUEST="92000000-0000-4000-8000-000000000001";
const DOCUMENT="93000000-0000-4000-8000-000000000001";
const QUOTE="94000000-0000-4000-8000-000000000001";
const PAYMENT_INTENT="95000000-0000-4000-8000-000000000001";
const PROVIDER_TX="96000000-0000-4000-8000-000000000001";
const REG_POLICY="97000000-0000-4000-8000-000000000001";
const FISC_POLICY="97000000-0000-4000-8000-000000000002";
let RESIDENCY_POLICY="98000000-0000-4000-8000-000000000001";

const actor={
  organizationId:ORG,userId:USER,membershipId:MEMBERSHIP,requestId:"compliance-integration-test"
};

class TestVault implements DocumentUploadVaultPort{
  readonly vaultId="vault-test";

  async createUpload(input:Parameters<DocumentUploadVaultPort["createUpload"]>[0]){
    return {
      objectKey:"uz-test/guest-documents/"+input.documentRecordId+".bin",
      storageRegion:input.storageRegion,
      uploadUrl:"https://upload.invalid/"+input.documentRecordId,
      expiresAt:"2030-01-01T00:00:00.000Z",
      requiredHeaders:{"content-type":input.contentType},
      encryptionKeyRef:"kms-test"
    };
  }

  async finalizeUpload(input:Parameters<DocumentUploadVaultPort["finalizeUpload"]>[0]){
    return {
      objectKey:input.objectKey,
      checksumSha256:"a".repeat(64),
      encryptionKeyRef:"kms-test-finalized",
      documentNumberHash:"document-hash-"+input.documentRecordId
    };
  }

  async readDocument(_documentRecordId:string){
    return {
      documentType:"passport",documentNumber:"TEST-PASSPORT-001",
      issuingCountryCode:"DE",expiresOn:"2030-01-01"
    };
  }
}

class TestRegistrationProvider implements GuestRegistrationProviderPort{
  readonly provider="emehmon-test";
  async submit(input:Parameters<GuestRegistrationProviderPort["submit"]>[0]){
    expect(input.idempotencyKey).toBe("registration:"+input.caseId);
    expect(input.document.documentNumber).toBe("TEST-PASSPORT-001");
    return {
      status:"confirmed" as const,
      externalRegistrationId:"EM-TEST-001",
      confirmationObjectKey:"uz-test/emehmon/EM-TEST-001.pdf",
      responseMetadata:{test:true}
    };
  }
}

class TestFiscalizationProvider implements FiscalizationProviderPort{
  readonly provider="fiscal-test";
  async submit(input:Parameters<FiscalizationProviderPort["submit"]>[0]){
    expect(input.idempotencyKey).toContain("fiscal:");
    expect(input.amountMinor).toBe(1000000n);
    return {
      status:"confirmed" as const,
      externalReceiptId:"RECEIPT-TEST-001",
      fiscalSign:"TEST-SIGN",
      receiptUrl:"https://example.invalid/receipt/1",
      responseMetadata:{test:true}
    };
  }
}

const db=new DatabaseService();
const registry=new ComplianceProviderRegistry();
registry.registerVault(new TestVault());
registry.registerGuestRegistration(new TestRegistrationProvider());
registry.registerFiscalization(new TestFiscalizationProvider());
const documents=new GuestDocumentService(db,registry);
const registrations=new GuestRegistrationService(db,registry);
const deadlines=new RegistrationDeadlineService(db);
const fiscalization=new FiscalizationService(db,registry);

beforeAll(async()=>{
  await db.withActor(actor,async client=>{
    await client.query(
      `INSERT INTO compliance_policy_versions(
         id,organization_id,country_code,code,version,config,legal_references,effective_from,active
       ) VALUES
       ($1,$3,'UZ','guest_registration',1,$4::jsonb,$5::jsonb,'2026-01-01',true),
       ($2,$3,'UZ','fiscalization',1,$6::jsonb,$7::jsonb,'2026-01-01',true)
       ON CONFLICT DO NOTHING`,
      [
        REG_POLICY,FISC_POLICY,ORG,
        JSON.stringify({provider:"emehmon-test",dueHours:24,documentVaultId:"vault-test"}),
        JSON.stringify(["CHECK_CURRENT_REGISTRATION_LAW","E-mehmon"]),
        JSON.stringify({provider:"fiscal-test"}),
        JSON.stringify(["CHECK_ACCOUNTANT_PROVIDER_CONTRACT"])
      ]
    );

    const residency=await client.query(
      `INSERT INTO data_residency_policies(
         id,organization_id,country_code,data_category,required_storage_region,cross_border_allowed,
         conditions,legal_references,effective_from,active
       ) VALUES($1,$2,'UZ','guest_identity_document','UZ',false,'{}'::jsonb,$3::jsonb,'2026-01-01',true)
       ON CONFLICT(organization_id,country_code,data_category,effective_from)
       DO UPDATE SET required_storage_region='UZ',cross_border_allowed=false,active=true
       RETURNING id`,
      [RESIDENCY_POLICY,ORG,JSON.stringify(["PRODUCT_DEFAULT_UZ_REGION","CHECK_CURRENT_PERSONAL_DATA_LAW"])]
    );
    RESIDENCY_POLICY=residency.rows[0].id; // another suite may already own this natural key

    await client.query(
      `INSERT INTO booking_quotes(
         id,organization_id,property_id,unit_id,rate_plan_id,check_in_at,check_out_at,guest_context,currency,
         accommodation_minor,discount_minor,charges_minor,total_minor,cancellation_policy_snapshot,
         pricing_snapshot,input_hash,expires_at
       ) VALUES(
         $1,$2,$3,$4,$5,'2027-09-10T14:00:00+05','2027-09-12T12:00:00+05',
         '{"guests":[{"age":35,"residency":"nonresident"}]}'::jsonb,'UZS',
         1000000,0,0,1000000,'{"version":1,"propertyTimezone":"Asia/Tashkent","rules":[{"minHoursBeforeCheckIn":0,"refundBps":0}],"nonRefundableLineCodes":[]}'::jsonb,
         '{}'::jsonb,'compliance-test',now()+interval '1 day'
       ) ON CONFLICT DO NOTHING`,
      [QUOTE,ORG,PROPERTY,UNIT,RATE]
    );

    await client.query(
      `INSERT INTO reservations(
         id,organization_id,property_id,unit_id,rate_plan_id,confirmation_code,status,
         check_in_at,check_out_at,currency,accommodation_minor,total_minor,
         cancellation_policy_snapshot,quote_snapshot
       ) VALUES(
         $1,$2,$3,$4,$5,'VW-COMPLIANCE-TEST','confirmed',
         '2027-09-10T14:00:00+05','2027-09-12T12:00:00+05','UZS',1000000,1000000,
         '{"version":1,"propertyTimezone":"Asia/Tashkent","rules":[{"minHoursBeforeCheckIn":0,"refundBps":0}],"nonRefundableLineCodes":[]}'::jsonb,
         '{"quoteId":"94000000-0000-4000-8000-000000000001"}'::jsonb
       ) ON CONFLICT DO NOTHING`,
      [RESERVATION,ORG,PROPERTY,UNIT,RATE]
    );

    await client.query(
      `INSERT INTO reservation_guests(
         id,organization_id,reservation_id,is_primary,first_name,last_name,date_of_birth,
         nationality_country_code,residency_country_code
       ) VALUES($1,$2,$3,true,'Alex','Johnson','1991-05-10','DE','DE')
       ON CONFLICT DO NOTHING`,
      [RES_GUEST,ORG,RESERVATION]
    );

    await client.query(
      `INSERT INTO guest_document_records(
         id,organization_id,reservation_guest_id,document_type,issuing_country_code,expires_on,
         document_number_hash,encrypted_fields,storage_region,vault_id,encryption_key_ref,
         verification_status,verified_at,verified_by,data_residency_policy_id
       ) VALUES(
         $1,$2,$3,'passport','DE','2030-01-01',
         'test-document-hash',decode('00','hex'),'UZ','vault-test','kms-test',
         'verified',now(),$4,$5
       ) ON CONFLICT DO NOTHING`,
      [DOCUMENT,ORG,RES_GUEST,USER,RESIDENCY_POLICY]
    );

    await client.query(
      `INSERT INTO payment_intents(
         id,organization_id,reservation_id,quote_id,provider,status,amount_minor,currency,idempotency_key,
         captured_minor,refunded_minor
       ) VALUES($1,$2,$3,$4,'test-provider','captured',1000000,'UZS','compliance-payment',1000000,0)
       ON CONFLICT DO NOTHING`,
      [PAYMENT_INTENT,ORG,RESERVATION,QUOTE]
    );

    await client.query(
      `INSERT INTO provider_transactions(
         id,organization_id,payment_intent_id,provider,external_transaction_id,kind,
         amount_minor,currency,occurred_at,raw_metadata
       ) VALUES(
         $1,$2,$3,'test-provider','TX-COMPLIANCE-001','capture',
         1000000,'UZS','2027-09-01T12:00:00+05','{}'::jsonb
       ) ON CONFLICT DO NOTHING`,
      [PROVIDER_TX,ORG,PAYMENT_INTENT]
    );
  });
});

describe.sequential("Uzbekistan compliance integration",()=>{
  it("prepares one ready registration case from verified guest document",async()=>{
    const prepared=await registrations.prepareReservation(actor,RESERVATION);
    expect(prepared.cases).toHaveLength(1);
    expect(prepared.cases[0].status).toBe("ready");
    expect(prepared.cases[0].provider).toBe("emehmon-test");
    expect(prepared.cases[0].dueAt).toBe("2027-09-11T09:00:00.000Z");
  });

  it("enforces configured UZ document storage region before submission",async()=>{
    const prepared=await registrations.prepareReservation(actor,RESERVATION);
    const caseId=prepared.cases[0].id;
    await db.withActor(actor,async client=>{
      await client.query("UPDATE guest_document_records SET storage_region='EU' WHERE id=$1",[DOCUMENT]);
    });
    await expect(registrations.submitNow(actor,caseId)).rejects.toThrow("DOCUMENT_STORAGE_REGION_VIOLATION");
    await db.withActor(actor,async client=>{
      await client.query("UPDATE guest_document_records SET storage_region='UZ' WHERE id=$1",[DOCUMENT]);
    });
  });

  it("emits one idempotent due-soon alert from the frozen registration policy",async()=>{
    const first=await deadlines.emitTenantAlerts(
      ORG,100,new Date("2027-09-11T08:40:00.000Z")
    );
    expect(first.emitted).toBeGreaterThanOrEqual(1);

    const second=await deadlines.emitTenantAlerts(
      ORG,100,new Date("2027-09-11T08:40:00.000Z")
    );
    expect(second.emitted).toBe(0);

    const eventRow=await db.withActor(actor,async client=>{
      return (await client.query<{event_type:string;payload:{thresholdMinutes:number}}>(
        `SELECT event_type,payload
           FROM outbox_events
          WHERE aggregate_type='guest_registration'
            AND event_type='compliance.registration_due_soon'
          ORDER BY occurred_at DESC
          LIMIT 1`
      )).rows[0];
    });
    expect(eventRow.event_type).toBe("compliance.registration_due_soon");
    expect(eventRow.payload.thresholdMinutes).toBe(30);
  });

  it("submits registration through test-only vault/provider and confirms the case",async()=>{
    const prepared=await registrations.prepareReservation(actor,RESERVATION);
    const result=await registrations.submitNow(actor,prepared.cases[0].id);
    expect(result.status).toBe("confirmed");
    if(!("externalRegistrationId" in result))throw new Error("EXPECTED_FRESH_REGISTRATION_RESULT");
    expect(result.externalRegistrationId).toBe("EM-TEST-001");

    const queue=await registrations.listQueue(actor,PROPERTY,"confirmed");
    expect(queue.some(x=>x.id===prepared.cases[0].id)).toBe(true);
  });

  it("uses policy-selected regional direct upload, finalizes checksum and verifies document idempotently",async()=>{
    const upload=await documents.beginUpload(actor,RES_GUEST,{
      documentType:"passport",
      contentType:"image/jpeg",
      issuingCountryCode:"DE",
      expiresOn:"2031-01-01"
    });
    expect(upload.storageRegion).toBe("UZ");
    expect(upload.uploadUrl).toBe("https://upload.invalid/"+upload.documentRecordId);
    expect(upload.requiredHeaders["content-type"]).toBe("image/jpeg");

    const finalized=await documents.finalizeUpload(actor,upload.documentRecordId);
    expect(finalized.status).toBe("pending_verification");
    expect(finalized.checksumSha256).toBe("a".repeat(64));

    const verified=await documents.verify(actor,upload.documentRecordId);
    expect(verified.status).toBe("verified");
    expect(verified.idempotentReplay).toBe(false);

    const replay=await documents.verify(actor,upload.documentRecordId);
    expect(replay.idempotentReplay).toBe(true);

    const stored=await db.withActor(actor,async client=>{
      return (await client.query<{
        storage_region:string;vault_id:string;object_checksum_sha256:string;
        verification_status:string;data_residency_policy_id:string;
      }>(
        `SELECT storage_region,vault_id,object_checksum_sha256,
                verification_status,data_residency_policy_id
           FROM guest_document_records WHERE id=$1`,
        [upload.documentRecordId]
      )).rows[0];
    });
    expect(stored.storage_region).toBe("UZ");
    expect(stored.vault_id).toBe("vault-test");
    expect(stored.object_checksum_sha256).toBe("a".repeat(64));
    expect(stored.verification_status).toBe("verified");
    expect(stored.data_residency_policy_id).toBe(RESIDENCY_POLICY);
  });

  it("creates fiscalization once per provider transaction and confirms the receipt",async()=>{
    const first=await fiscalization.prepareFromProviderTransaction(actor,PROVIDER_TX);
    const second=await fiscalization.prepareFromProviderTransaction(actor,PROVIDER_TX);
    expect(second.requestId).toBe(first.requestId);
    expect(second.idempotentReplay).toBe(true);
    expect(first.amountMinor).toBe(1000000n);

    const submitted=await fiscalization.submitNow(actor,first.requestId);
    expect(submitted.status).toBe("confirmed");
    if(!("externalReceiptId" in submitted))throw new Error("EXPECTED_FRESH_FISCAL_RESULT");
    expect(submitted.externalReceiptId).toBe("RECEIPT-TEST-001");

    const state=await db.withActor(actor,async client=>{
      const request=await client.query<{status:string;external_receipt_id:string}>(
        "SELECT status,external_receipt_id FROM fiscalization_requests WHERE id=$1",[first.requestId]
      );
      const attempts=await client.query<{count:string}>(
        "SELECT count(*)::text AS count FROM fiscalization_attempts WHERE fiscalization_request_id=$1",[first.requestId]
      );
      return {request:request.rows[0],attempts:Number(attempts.rows[0].count)};
    });
    expect(state.request.status).toBe("confirmed");
    expect(state.request.external_receipt_id).toBe("RECEIPT-TEST-001");
    expect(state.attempts).toBe(1);
  });
});

afterAll(async()=>{await db.onModuleDestroy()});
