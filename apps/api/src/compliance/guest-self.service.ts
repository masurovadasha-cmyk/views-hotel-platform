import {randomUUID} from "node:crypto";
import {Injectable} from "@nestjs/common";
import {DatabaseService} from "../database/database.service";
import {supportsDocumentUpload} from "./document-upload-vault.port";
import type {GuestAccessScope} from "./guest-access.service";
import {ComplianceProviderRegistry} from "./provider.registry";

type RegistrationPolicyConfig={documentVaultId:string};
type ResidencyConditions={defaultStorageRegion?:string};

const guestDocumentTypes=new Set([
  "passport","id_card","birth_certificate","residence_permit","travel_document","other"
]);

@Injectable()
export class GuestSelfService{
  constructor(
    private readonly db:DatabaseService,
    private readonly providers:ComplianceProviderRegistry
  ){}

  async summary(scope:GuestAccessScope){
    return this.db.withOrganization(scope.organizationId,async client=>{
      const reservation=(await client.query<{
        id:string;status:string;check_in_at:Date;check_out_at:Date;
        property_id:string;property_name:unknown;city:string;country_code:string;
      }>(
        `SELECT r.id,r.status,r.check_in_at,r.check_out_at,r.property_id,
                p.name AS property_name,p.city,p.country_code
           FROM reservations r
           JOIN properties p ON p.id=r.property_id
          WHERE r.id=$1 AND r.organization_id=$2`,
        [scope.reservationId,scope.organizationId]
      )).rows[0];
      if(!reservation)throw new Error("GUEST_ACCESS_UNAUTHORIZED");

      const guests=await client.query<{
        id:string;is_primary:boolean;first_name:string;last_name:string;
        document_status:string|null;
      }>(
        `SELECT rg.id,rg.is_primary,rg.first_name,rg.last_name,
                (
                  SELECT d.verification_status::text
                    FROM guest_document_records d
                   WHERE d.reservation_guest_id=rg.id
                   ORDER BY d.updated_at DESC,d.created_at DESC
                   LIMIT 1
                ) AS document_status
           FROM reservation_guests rg
          WHERE rg.reservation_id=$1 AND rg.organization_id=$2
          ORDER BY rg.is_primary DESC,rg.created_at`,
        [scope.reservationId,scope.organizationId]
      );

      return {
        session:{id:scope.sessionId,expiresAt:scope.expiresAt},
        reservation:{
          id:reservation.id,status:reservation.status,
          checkInAt:reservation.check_in_at.toISOString(),
          checkOutAt:reservation.check_out_at.toISOString()
        },
        property:{
          id:reservation.property_id,name:reservation.property_name,
          city:reservation.city,countryCode:reservation.country_code
        },
        guests:guests.rows.map(g=>({
          id:g.id,isPrimary:g.is_primary,firstName:g.first_name,lastName:g.last_name,
          documentStatus:g.document_status
        }))
      };
    });
  }

  async beginDocumentUpload(
    scope:GuestAccessScope,
    reservationGuestId:string,
    input:{
      documentType:string;contentType:string;issuingCountryCode?:string;
      expiresOn?:string;maxBytes?:number;
    }
  ){
    if(!guestDocumentTypes.has(input.documentType))throw new Error("INVALID_DOCUMENT_TYPE");
    if(!/^[-\w.]+\/[-+\w.]+$/.test(input.contentType))throw new Error("INVALID_DOCUMENT_CONTENT_TYPE");
    const maxBytes=input.maxBytes??12*1024*1024;
    if(!Number.isInteger(maxBytes)||maxBytes<1024||maxBytes>25*1024*1024){
      throw new Error("INVALID_DOCUMENT_MAX_BYTES");
    }

    const context=await this.db.withOrganization(scope.organizationId,async client=>{
      const guest=(await client.query<{
        country_code:string;timezone:string;reservation_status:string;
      }>(
        `SELECT p.country_code,p.timezone,r.status AS reservation_status
           FROM reservation_guests rg
           JOIN reservations r ON r.id=rg.reservation_id
           JOIN properties p ON p.id=r.property_id
          WHERE rg.id=$1
            AND rg.organization_id=$2
            AND rg.reservation_id=$3
            AND r.id=$3
            AND r.organization_id=$2`,
        [reservationGuestId,scope.organizationId,scope.reservationId]
      )).rows[0];
      if(!guest)throw new Error("RESERVATION_GUEST_NOT_FOUND");
      if(!["confirmed","checked_in"].includes(guest.reservation_status)){
        throw new Error("DOCUMENT_UPLOAD_NOT_AVAILABLE");
      }

      const policyDate=(await client.query<{local_date:string}>(
        "SELECT (now() AT TIME ZONE $1)::date::text AS local_date",[guest.timezone]
      )).rows[0].local_date;

      const registration=(await client.query<{config:RegistrationPolicyConfig}>(
        `SELECT config
           FROM compliance_policy_versions
          WHERE organization_id=$1
            AND country_code=$2
            AND code='guest_registration'
            AND active=true
            AND effective_from<=$3::date
            AND (effective_to IS NULL OR effective_to>=$3::date)
          ORDER BY version DESC
          LIMIT 1`,
        [scope.organizationId,guest.country_code,policyDate]
      )).rows[0];
      if(!registration?.config?.documentVaultId){
        throw new Error("REGISTRATION_POLICY_NOT_CONFIGURED");
      }

      const residency=(await client.query<{
        id:string;required_storage_region:string|null;conditions:ResidencyConditions;
      }>(
        `SELECT id,required_storage_region,conditions
           FROM data_residency_policies
          WHERE organization_id=$1
            AND country_code=$2
            AND data_category='guest_identity_document'
            AND active=true
            AND effective_from<=$3::date
            AND (effective_to IS NULL OR effective_to>=$3::date)
          ORDER BY effective_from DESC
          LIMIT 1`,
        [scope.organizationId,guest.country_code,policyDate]
      )).rows[0];
      if(!residency)throw new Error("DATA_RESIDENCY_POLICY_NOT_CONFIGURED");

      const storageRegion=residency.required_storage_region
        ??residency.conditions?.defaultStorageRegion
        ??null;
      if(!storageRegion)throw new Error("DOCUMENT_STORAGE_REGION_UNRESOLVED");

      return {
        vaultId:registration.config.documentVaultId,
        storageRegion,
        residencyPolicyId:residency.id
      };
    });

    const vault=this.providers.vault(context.vaultId);
    if(!supportsDocumentUpload(vault))throw new Error("DOCUMENT_UPLOAD_NOT_SUPPORTED");

    const documentRecordId=randomUUID();
    const upload=await vault.createUpload({
      documentRecordId,
      organizationId:scope.organizationId,
      reservationGuestId,
      storageRegion:context.storageRegion,
      contentType:input.contentType,
      maxBytes
    });
    if(upload.storageRegion!==context.storageRegion)throw new Error("DOCUMENT_VAULT_REGION_MISMATCH");
    if(!upload.objectKey||!/^https:\/\//i.test(upload.uploadUrl)){
      throw new Error("INVALID_DOCUMENT_UPLOAD_RESPONSE");
    }

    const inserted=await this.db.withOrganization(scope.organizationId,async client=>{
      return (await client.query<{id:string}>(
        `INSERT INTO guest_document_records(
           id,organization_id,reservation_guest_id,document_type,issuing_country_code,expires_on,
           object_key,storage_region,vault_id,encryption_key_ref,verification_status,data_residency_policy_id
         )
         SELECT $1,$2,rg.id,$5,$6,$7,$8,$9,$10,$11,'pending',$12
           FROM reservation_guests rg
          WHERE rg.id=$3
            AND rg.organization_id=$2
            AND rg.reservation_id=$4
         RETURNING id`,
        [
          documentRecordId,scope.organizationId,reservationGuestId,scope.reservationId,
          input.documentType,input.issuingCountryCode??null,input.expiresOn??null,
          upload.objectKey,upload.storageRegion,context.vaultId,
          upload.encryptionKeyRef??null,context.residencyPolicyId
        ]
      )).rows[0];
    });
    if(!inserted)throw new Error("RESERVATION_GUEST_NOT_FOUND");

    return {
      documentRecordId,
      uploadUrl:upload.uploadUrl,
      expiresAt:upload.expiresAt,
      requiredHeaders:upload.requiredHeaders??{},
      storageRegion:upload.storageRegion
    };
  }

  async finalizeDocumentUpload(scope:GuestAccessScope,documentRecordId:string){
    const context=await this.db.withOrganization(scope.organizationId,async client=>{
      const row=(await client.query<{
        object_key:string|null;storage_region:string;vault_id:string;
        verification_status:string;data_residency_policy_id:string|null;
      }>(
        `SELECT d.object_key,d.storage_region,d.vault_id,
                d.verification_status,d.data_residency_policy_id
           FROM guest_document_records d
           JOIN reservation_guests rg ON rg.id=d.reservation_guest_id
          WHERE d.id=$1
            AND d.organization_id=$2
            AND rg.organization_id=$2
            AND rg.reservation_id=$3`,
        [documentRecordId,scope.organizationId,scope.reservationId]
      )).rows[0];
      if(!row)throw new Error("DOCUMENT_RECORD_NOT_FOUND");
      if(!row.object_key)throw new Error("DOCUMENT_OBJECT_KEY_MISSING");
      if(!row.data_residency_policy_id)throw new Error("DATA_RESIDENCY_POLICY_NOT_SNAPSHOTTED");
      if(row.verification_status==="verified")throw new Error("DOCUMENT_ALREADY_VERIFIED");
      return {...row,object_key:row.object_key};
    });

    const vault=this.providers.vault(context.vault_id);
    if(!supportsDocumentUpload(vault))throw new Error("DOCUMENT_UPLOAD_NOT_SUPPORTED");
    const finalized=await vault.finalizeUpload({
      documentRecordId,
      objectKey:context.object_key,
      storageRegion:context.storage_region
    });
    if(finalized.objectKey!==context.object_key)throw new Error("DOCUMENT_OBJECT_KEY_MISMATCH");
    if(!/^[a-f0-9]{64}$/i.test(finalized.checksumSha256)){
      throw new Error("INVALID_DOCUMENT_CHECKSUM");
    }

    await this.db.withOrganization(scope.organizationId,async client=>{
      const updated=(await client.query<{id:string}>(
        `UPDATE guest_document_records d
            SET object_checksum_sha256=$1,
                encryption_key_ref=COALESCE($2,d.encryption_key_ref),
                document_number_hash=COALESCE($3,d.document_number_hash),
                updated_at=now()
           FROM reservation_guests rg
          WHERE d.id=$4
            AND d.organization_id=$5
            AND d.reservation_guest_id=rg.id
            AND rg.organization_id=$5
            AND rg.reservation_id=$6
          RETURNING d.id`,
        [
          finalized.checksumSha256,finalized.encryptionKeyRef??null,
          finalized.documentNumberHash??null,documentRecordId,
          scope.organizationId,scope.reservationId
        ]
      )).rows[0];
      if(!updated)throw new Error("DOCUMENT_RECORD_NOT_FOUND");

      await client.query(
        `INSERT INTO outbox_events(
           id,organization_id,aggregate_type,aggregate_id,event_type,idempotency_key,payload
         )
         VALUES(gen_random_uuid(),$1,'guest_document',$2,'compliance.document_upload_finalized',$3,$4::jsonb)
         ON CONFLICT(idempotency_key) DO NOTHING`,
        [
          scope.organizationId,documentRecordId,
          "compliance:document-finalized:"+documentRecordId+":"+finalized.checksumSha256,
          JSON.stringify({
            documentRecordId,
            reservationId:scope.reservationId,
            checksumSha256:finalized.checksumSha256,
            source:"guest_self_service"
          })
        ]
      );
    });

    return {
      documentRecordId,
      status:"pending_verification" as const,
      checksumSha256:finalized.checksumSha256
    };
  }
}
