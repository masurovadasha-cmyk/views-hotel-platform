import {afterAll,beforeAll,describe,expect,it} from "vitest";
import {DatabaseService} from "../database/database.service";
import type {DocumentUploadVaultPort} from "./document-upload-vault.port";
import {GuestAccessService} from "./guest-access.service";
import {GuestSelfService} from "./guest-self.service";
import {ComplianceProviderRegistry} from "./provider.registry";

const ORG="00000000-0000-0000-0000-000000000001";
const PROPERTY="00000000-0000-0000-0000-000000000002";
const UNIT="00000000-0000-0000-0000-000000000004";
const RATE="00000000-0000-0000-0000-000000000008";
const USER="20000000-0000-4000-8000-000000000001";
const MEMBERSHIP="30000000-0000-4000-8000-000000000001";

const RESERVATION="a1000000-0000-4000-8000-000000000001";
const RESERVATION_GUEST="a2000000-0000-4000-8000-000000000001";
const OTHER_RESERVATION="a1000000-0000-4000-8000-000000000002";
const OTHER_GUEST="a2000000-0000-4000-8000-000000000002";
const REG_POLICY="a3000000-0000-4000-8000-000000000001";
const RESIDENCY_POLICY="a4000000-0000-4000-8000-000000000001";

const actor={
  organizationId:ORG,userId:USER,membershipId:MEMBERSHIP,requestId:"guest-access-integration"
};

class GuestTestVault implements DocumentUploadVaultPort{
  readonly vaultId="vault-test";

  async createUpload(input:Parameters<DocumentUploadVaultPort["createUpload"]>[0]){
    return {
      objectKey:"uz-test/guest-self/"+input.documentRecordId+".bin",
      storageRegion:input.storageRegion,
      uploadUrl:"https://upload.invalid/guest-self/"+input.documentRecordId,
      expiresAt:"2030-01-01T00:00:00.000Z",
      requiredHeaders:{"content-type":input.contentType},
      encryptionKeyRef:"kms-guest-test"
    };
  }

  async finalizeUpload(input:Parameters<DocumentUploadVaultPort["finalizeUpload"]>[0]){
    return {
      objectKey:input.objectKey,
      checksumSha256:"b".repeat(64),
      encryptionKeyRef:"kms-guest-finalized",
      documentNumberHash:"guest-document-"+input.documentRecordId
    };
  }

  async readDocument(_documentRecordId:string){
    return {
      documentType:"passport",
      documentNumber:"GUEST-TEST-001",
      issuingCountryCode:"DE",
      expiresOn:"2032-01-01"
    };
  }
}

const db=new DatabaseService();
const registry=new ComplianceProviderRegistry();
registry.registerVault(new GuestTestVault());
const access=new GuestAccessService(db);
const guest=new GuestSelfService(db,registry);

beforeAll(async()=>{
  await db.withActor(actor,async client=>{
    await client.query(
      `INSERT INTO compliance_policy_versions(
         id,organization_id,country_code,code,version,config,legal_references,effective_from,active
       ) VALUES($1,$2,'UZ','guest_registration',1,$3::jsonb,'[]'::jsonb,'2026-01-01',true)
       ON CONFLICT(organization_id,country_code,code,version)
       DO UPDATE SET config=EXCLUDED.config,active=true`,
      [REG_POLICY,ORG,JSON.stringify({provider:"emehmon-test",dueHours:24,documentVaultId:"vault-test"})]
    );

    await client.query(
      `INSERT INTO data_residency_policies(
         id,organization_id,country_code,data_category,required_storage_region,cross_border_allowed,
         conditions,legal_references,effective_from,active
       ) VALUES($1,$2,'UZ','guest_identity_document','UZ',false,'{}'::jsonb,'[]'::jsonb,'2026-01-01',true)
       ON CONFLICT(organization_id,country_code,data_category,effective_from)
       DO UPDATE SET required_storage_region='UZ',cross_border_allowed=false,active=true`,
      [RESIDENCY_POLICY,ORG]
    );

    await client.query(
      `INSERT INTO reservations(
         id,organization_id,property_id,unit_id,rate_plan_id,confirmation_code,status,
         check_in_at,check_out_at,currency,accommodation_minor,total_minor,
         cancellation_policy_snapshot,quote_snapshot
       ) VALUES
       ($1,$3,$4,$5,$6,'VW-GUEST-ACCESS-1','confirmed',
        '2027-10-10T14:00:00+05','2027-10-12T12:00:00+05','UZS',1000000,1000000,'{}'::jsonb,'{}'::jsonb),
       ($2,$3,$4,$5,$6,'VW-GUEST-ACCESS-2','confirmed',
        '2027-10-20T14:00:00+05','2027-10-22T12:00:00+05','UZS',1000000,1000000,'{}'::jsonb,'{}'::jsonb)
       ON CONFLICT(id) DO NOTHING`,
      [RESERVATION,OTHER_RESERVATION,ORG,PROPERTY,UNIT,RATE]
    );

    await client.query(
      `INSERT INTO reservation_guests(
         id,organization_id,reservation_id,is_primary,first_name,last_name,date_of_birth,
         nationality_country_code,residency_country_code
       ) VALUES
       ($1,$3,$4,true,'Alex','Johnson','1991-05-10','DE','DE'),
       ($2,$3,$5,true,'Sarah','Miller','1992-03-12','US','US')
       ON CONFLICT(id) DO NOTHING`,
      [RESERVATION_GUEST,OTHER_GUEST,ORG,RESERVATION,OTHER_RESERVATION]
    );
  });
});

describe.sequential("Stage 5 reservation-scoped guest access",()=>{
  it("issues only an opaque token and resolves it to one reservation scope",async()=>{
    const issued=await access.issue(actor,RESERVATION,60);
    expect(issued.accessToken.startsWith("vga_")).toBe(true);
    expect(issued.accessToken.length).toBeGreaterThan(40);

    const scope=await access.resolve(issued.accessToken);
    expect(scope.organizationId).toBe(ORG);
    expect(scope.reservationId).toBe(RESERVATION);
    expect(scope.propertyId).toBe(PROPERTY);

    const stored=await db.withActor(actor,async client=>{
      return (await client.query<{token_hash:string}>(
        "SELECT token_hash FROM guest_access_sessions WHERE id=$1",[issued.sessionId]
      )).rows[0];
    });
    expect(stored.token_hash).not.toContain(issued.accessToken);
    expect(stored.token_hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("returns only the guests that belong to the scoped reservation",async()=>{
    const issued=await access.issue(actor,RESERVATION,60);
    const scope=await access.resolve(issued.accessToken);
    const result=await guest.summary(scope);

    expect(result.reservation.id).toBe(RESERVATION);
    expect(result.guests.map(x=>x.id)).toEqual([RESERVATION_GUEST]);
    expect(result.guests.some(x=>x.id===OTHER_GUEST)).toBe(false);
  });

  it("blocks a cross-reservation document upload before a vault write",async()=>{
    const issued=await access.issue(actor,RESERVATION,60);
    const scope=await access.resolve(issued.accessToken);

    await expect(guest.beginDocumentUpload(scope,OTHER_GUEST,{
      documentType:"passport",contentType:"image/jpeg"
    })).rejects.toThrow("RESERVATION_GUEST_NOT_FOUND");
  });

  it("uploads and finalizes only a document in the token reservation",async()=>{
    const issued=await access.issue(actor,RESERVATION,60);
    const scope=await access.resolve(issued.accessToken);

    const upload=await guest.beginDocumentUpload(scope,RESERVATION_GUEST,{
      documentType:"passport",
      contentType:"image/jpeg",
      issuingCountryCode:"DE",
      expiresOn:"2032-01-01"
    });
    expect(upload.storageRegion).toBe("UZ");
    expect(upload.uploadUrl).toContain(upload.documentRecordId);

    const finalized=await guest.finalizeDocumentUpload(scope,upload.documentRecordId);
    expect(finalized.status).toBe("pending_verification");
    expect(finalized.checksumSha256).toBe("b".repeat(64));

    const stored=await db.withActor(actor,async client=>{
      return (await client.query<{
        reservation_id:string;object_checksum_sha256:string;verification_status:string;
      }>(
        `SELECT rg.reservation_id,d.object_checksum_sha256,d.verification_status
           FROM guest_document_records d
           JOIN reservation_guests rg ON rg.id=d.reservation_guest_id
          WHERE d.id=$1`,
        [upload.documentRecordId]
      )).rows[0];
    });
    expect(stored.reservation_id).toBe(RESERVATION);
    expect(stored.object_checksum_sha256).toBe("b".repeat(64));
    expect(stored.verification_status).toBe("pending");
  });

  it("revokes a token and rejects it immediately",async()=>{
    const issued=await access.issue(actor,RESERVATION,60);
    await access.revoke(actor,issued.sessionId);
    await expect(access.resolve(issued.accessToken)).rejects.toThrow("GUEST_ACCESS_UNAUTHORIZED");
  });
});

afterAll(async()=>{await db.onModuleDestroy()});
